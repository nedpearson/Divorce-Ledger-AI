import { Router } from 'express';
import { requireAuth } from '../middleware/authz';
import { recurringBillsService } from '../services/recurring-bills.service';
import { z } from 'zod';
import { db } from '../db';
import { recurringBillTemplates, insertRecurringBillTemplateSchema } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { normalizeEnv } from '../lib/normalizeEnv';

const router = Router();

// Ensure all routes require authentication
router.use(requireAuth);

/**
 * GET templates
 */
router.get('/templates', async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const environment = normalizeEnv(req.headers['x-environment'] as string | undefined);
    const templates = await recurringBillsService.getTemplates(userId, environment);
    res.json(templates);
  } catch (error: any) {
    console.error('Failed to get templates:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST templates
 */
router.post('/templates', async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const environment = normalizeEnv(req.headers['x-environment'] as string | undefined);
    const caseId = req.body.caseId || 'demo-case-id'; // Fallback if not provided in payload
    
    const payload = { ...req.body, userId, caseId, environment };
    const validated = insertRecurringBillTemplateSchema.parse(payload);
    
    const [inserted] = await db.insert(recurringBillTemplates).values(validated).returning();
    
    // Automatically generate cycles immediately
    await recurringBillsService.generateMonthlyCycles(userId, environment);
    
    // Retroactively match newly created pending cycles against past uploaded documents
    await recurringBillsService.retroactiveMatchAllPendings(userId, environment);
    
    res.json(inserted);
  } catch (error: any) {
    console.error('Failed to create template:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * PATCH template
 */
router.patch('/templates/:id', async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const environment = normalizeEnv(req.headers['x-environment'] as string | undefined);
    const { id } = req.params;
    
    const [updated] = await db.update(recurringBillTemplates)
      .set({ ...req.body, updatedAt: new Date() })
      .where(and(eq(recurringBillTemplates.id, id), eq(recurringBillTemplates.userId, userId)))
      .returning();
      
    res.json(updated);
  } catch (error: any) {
    console.error('Failed to update template:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * DELETE template
 */
router.delete('/templates/:id', async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const { id } = req.params;
    
    await db.delete(recurringBillTemplates)
      .where(and(eq(recurringBillTemplates.id, id), eq(recurringBillTemplates.userId, userId)));
      
    res.json({ success: true });
  } catch (error: any) {
    console.error('Failed to delete template:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET Dashboard metrics
 */
router.get('/dashboard', async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const environment = normalizeEnv(req.headers['x-environment'] as string | undefined);
    
    // Before fetching, ensure generation and detection have run
    await recurringBillsService.generateMonthlyCycles(userId, environment);
    await recurringBillsService.detectMissingBills(userId, environment);
    
    const stats = await recurringBillsService.getDashboardWidgetStats(userId, environment);
    res.json(stats);
  } catch (error: any) {
    console.error('Failed to get recurring bill stats:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
