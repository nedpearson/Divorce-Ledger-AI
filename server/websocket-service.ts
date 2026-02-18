import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { DashboardService, DashboardMetrics } from './dashboard-service';

export class WebSocketService {
  private io: SocketIOServer;
  private dashboardService: DashboardService;
  private connectedClients: Set<string> = new Set();

  constructor(httpServer: HTTPServer, dashboardService: DashboardService) {
    // Build allowed origins from environment
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:5000',
      'https://divorceledger.replit.app',
      'https://divorceledger.live',
    ];
    
    // Add domains from REPLIT_DOMAINS if available
    if (process.env.REPLIT_DOMAINS) {
      const replitDomains = process.env.REPLIT_DOMAINS.split(',').map(d => `https://${d.trim()}`);
      allowedOrigins.push(...replitDomains);
    }
    
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: allowedOrigins,
        methods: ['GET', 'POST'],
      },
    });

    this.dashboardService = dashboardService;
  }

  initialize(): void {
    this.io.on('connection', (socket: Socket) => {
      console.log(`Dashboard client connected: ${socket.id}`);
      this.connectedClients.add(socket.id);

      socket.emit('metrics:initial', this.dashboardService.getMetrics());

      this.dashboardService.on('metrics:updated', (metrics: DashboardMetrics) => {
        socket.emit('metrics:update', metrics);
      });

      socket.on('disconnect', () => {
        console.log(`Dashboard client disconnected: ${socket.id}`);
        this.connectedClients.delete(socket.id);
      });

      socket.on('action:refresh', async () => {
        socket.emit('metrics:update', this.dashboardService.getMetrics());
      });

      socket.on('action:drill-down', async (metric: string) => {
        const details = await this.getDrillDownData(metric);
        socket.emit('data:drill-down', { metric, details });
      });
    });

    console.log(`WebSocket server initialized`);
  }

  private async getDrillDownData(metric: string): Promise<unknown> {
    return {};
  }

  broadcast(event: string, data: unknown): void {
    this.io.emit(event, data);
  }

  getConnectedClients(): number {
    return this.connectedClients.size;
  }
}
