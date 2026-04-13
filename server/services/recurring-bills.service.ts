import { db } from '../db';
import { eq, and, lte, or, isNull, sql } from 'drizzle-orm';
import { 
  recurringBillTemplates, 
  recurringBillCycles,
  recurringBillNotifications,
  type InsertRecurringBillTemplate,
  type RecurringBillTemplate,
  type RecurringBillCycle,
} from '@shared/schema';

export class RecurringBillsService {
  
  /**
   * Retrieves active recurring bill templates for a specific user and environment.
   */
  async getTemplates(userId: string, environment: string = 'demo'): Promise<RecurringBillTemplate[]> {
    return await db.query.recurringBillTemplates.findMany({
      where: and(
        eq(recurringBillTemplates.userId, userId),
        eq(recurringBillTemplates.environment, environment),
        eq(recurringBillTemplates.active, true)
      ),
      orderBy: (templates, { asc }) => [asc(templates.createdAt)],
    });
  }

  /**
   * Generates missing cycles for the current month based on active templates.
   */
  async generateMonthlyCycles(userId: string, environment: string = 'demo') {
    const templates = await this.getTemplates(userId, environment);
    
    const now = new Date();
    const cycleMonth = now.getMonth() + 1; // 1-12
    const cycleYear = now.getFullYear();

    for (const template of templates) {
      // Check if a cycle already exists for this template/month/year
      const existingCycle = await db.query.recurringBillCycles.findFirst({
        where: and(
          eq(recurringBillCycles.recurringBillTemplateId, template.id),
          eq(recurringBillCycles.cycleMonth, cycleMonth),
          eq(recurringBillCycles.cycleYear, cycleYear)
        )
      });

      if (!existingCycle) {
        // Create new cycle
        const expectedStartDate = new Date(cycleYear, cycleMonth - 1, 1);
        const expectedEndDate = new Date(cycleYear, cycleMonth, 0); // Last day of month
        
        let dueDate = null;
        if (template.dueDayOfMonth) {
          dueDate = new Date(cycleYear, cycleMonth - 1, template.dueDayOfMonth);
        }

        await db.insert(recurringBillCycles).values({
          recurringBillTemplateId: template.id,
          cycleMonth,
          cycleYear,
          expectedStartDate,
          expectedEndDate,
          dueDate,
          status: 'pending',
          missingFlag: false,
        }).onConflictDoNothing().catch(e => console.error('[generateMonthlyCycles] Insert error:', e.message));
      }
    }
  }

  /**
   * Evaluates pending cycles and targets them as missing if past expected dates.
   */
  async detectMissingBills(userId: string, environment: string = 'demo') {
    const now = new Date();

    // Find cycles that are pending
    const templates = await this.getTemplates(userId, environment);
    for (const template of templates) {
      const cycles = await db.query.recurringBillCycles.findMany({
        where: and(
          eq(recurringBillCycles.recurringBillTemplateId, template.id),
          eq(recurringBillCycles.status, 'pending'),
          eq(recurringBillCycles.waivedFlag, false)
        )
      });

      for (const cycle of cycles) {
        // Simple missing logic: if the expectedEndDate has passed by "uploadWindowEndOffset" days 
        const windowEndOffset = template.uploadWindowEndOffset || 14;
        
        let targetCheckDate: Date;
        if (cycle.dueDate) {
          targetCheckDate = new Date(cycle.dueDate);
        } else {
          targetCheckDate = new Date(cycle.expectedEndDate);
        }
        
        // Add window offset
        targetCheckDate.setDate(targetCheckDate.getDate() + windowEndOffset);

        if (now > targetCheckDate) {
          // It is missing
          await db.update(recurringBillCycles)
            .set({ status: 'missing', missingFlag: true, updatedAt: new Date() })
            .where(eq(recurringBillCycles.id, cycle.id));

          // Create missing notification
          await db.insert(recurringBillNotifications).values({
            recurringBillCycleId: cycle.id,
            userId: userId,
            notificationType: 'missing',
            severity: 'warning'
          });
        }
      }
    }
  }

  /**
   * Attempts to match a newly uploaded document to an existing pending cycle.
   */
  async matchDocumentToCycle(userId: string, documentId: string, vendorName: string, docDate: Date | null, category: string | null) {
    if (!docDate || !vendorName) return;

    const cycleMonth = docDate.getMonth() + 1;
    const cycleYear = docDate.getFullYear();

    // Find any pending or missing cycle with matching month/year and matching vendor via template
    const cycles = await db.select({
      cycle: recurringBillCycles,
      template: recurringBillTemplates
    }).from(recurringBillCycles)
      .innerJoin(recurringBillTemplates, eq(recurringBillCycles.recurringBillTemplateId, recurringBillTemplates.id))
      .where(and(
        eq(recurringBillTemplates.userId, userId),
        or(eq(recurringBillCycles.status, 'pending'), eq(recurringBillCycles.status, 'missing')),
        eq(recurringBillCycles.cycleMonth, cycleMonth),
        eq(recurringBillCycles.cycleYear, cycleYear)
      ));

    for (const { cycle, template } of cycles) {
      // Basic heuristic: check if vendor match
      const vendorSafe = template.vendorName.toLowerCase();
      const docVendorSafe = vendorName.toLowerCase();
      
      if (docVendorSafe.includes(vendorSafe) || vendorSafe.includes(docVendorSafe)) {
        // Or if exact category match
        await db.update(recurringBillCycles)
          .set({ 
            status: 'uploaded', 
            matchedDocumentId: documentId, 
            matchConfidence: '0.90',
            missingFlag: false,
            updatedAt: new Date()
          })
          .where(eq(recurringBillCycles.id, cycle.id));
          
        // Any unread notifications for this cycle should be marked resolved/read
        await db.update(recurringBillNotifications)
          .set({ status: 'read' })
          .where(and(
             eq(recurringBillNotifications.recurringBillCycleId, cycle.id),
             eq(recurringBillNotifications.status, 'unread')
          ));
        
        break; // Matched first best cycle
      }
    }
  }

  async getDashboardWidgetStats(userId: string, environment: string = 'demo') {
    const templates = await this.getTemplates(userId, environment);
    const templateIds = templates.map(t => t.id);
    
    if (templateIds.length === 0) {
      return { totalExpected: 0, totalMissing: 0, totalOverdue: 0, byCategory: [] };
    }
    
    const now = new Date();
    const cycleMonth = now.getMonth() + 1;
    const cycleYear = now.getFullYear();
    
    const currentCycles = await db.query.recurringBillCycles.findMany({
      where: and(
        sql`recurring_bill_template_id IN ${templateIds}`,
        eq(recurringBillCycles.cycleMonth, cycleMonth),
        eq(recurringBillCycles.cycleYear, cycleYear)
      ),
      with: {
        template: true
      } // Requires relation setup, we will query via join if relation isn't declared.
    });
    
    // Instead of relation "with", let's perform standard join since we didn't specify Drizzle relations locally.
    const allCycles = await db.select({
      cycle: recurringBillCycles,
      template: recurringBillTemplates
    }).from(recurringBillCycles)
      .innerJoin(recurringBillTemplates, eq(recurringBillCycles.recurringBillTemplateId, recurringBillTemplates.id))
      .where(and(
        eq(recurringBillTemplates.userId, userId),
        eq(recurringBillTemplates.environment, environment),
        eq(recurringBillCycles.cycleMonth, cycleMonth),
        eq(recurringBillCycles.cycleYear, cycleYear)
      ));
      
    let totalMissing = 0;
    let totalOverdue = 0;
    
    for (const { cycle } of allCycles) {
      if (cycle.status === 'missing') totalMissing++;
      if (cycle.status === 'overdue') totalOverdue++;
    }

    return {
      totalExpected: allCycles.length,
      totalMissing,
      totalOverdue,
      cycles: allCycles
    };
  }
}

export const recurringBillsService = new RecurringBillsService();
