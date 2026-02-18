import { getPool } from '../db';
import { escapeIdentifier, escapeTableName, isDemoMode } from './sql-utils';
import { safeQuery } from '../lib/safeQuery';

export interface ColumnProfile {
  tableName: string;
  columnName: string;
  dataType: string;
  totalCount: number;
  nullCount: number;
  uniqueCount: number;
  nullPercent: number;
  uniquePercent: number;
  minValue?: string;
  maxValue?: string;
  meanValue?: number;
  stdDevValue?: number;
  percentiles?: { p25: number; p50: number; p75: number; p90: number; p95: number; p99: number };
  topValues?: { value: string; count: number }[];
}

export interface TableProfile {
  tableName: string;
  rowCount: number;
  columnCount: number;
  columns: ColumnProfile[];
  profiledAt: Date;
}

export interface AnomalyDetection {
  tableName: string;
  columnName?: string;
  anomalyType: 'spike' | 'drop' | 'drift' | 'outlier' | 'missing_data' | 'schema_change';
  severity: 'info' | 'warning' | 'critical';
  description: string;
  expectedBaseline: string;
  actualValue: string;
  deviationScore: number;
}

class DataProfiler {
  async profileTable(tableName: string): Promise<TableProfile> {
    if (isDemoMode()) {
      return this.createDemoProfile(tableName);
    }

    const pool = getPool();
    const safeTable = escapeTableName(tableName);
    
    const countResult = await safeQuery(pool, 'profiler:tableRowCount', `SELECT COUNT(*) as cnt FROM ${safeTable}`, []);
    const rowCount = parseInt(countResult.rows[0].cnt);

    const columnsResult = await safeQuery(
      pool,
      'profiler:tableColumns',
      `SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = $1
      ORDER BY ordinal_position`,
      [tableName]
    );

    const columns: ColumnProfile[] = [];

    for (const col of columnsResult.rows) {
      try {
        const profile = await this.profileColumn(tableName, col.column_name, col.data_type, rowCount);
        columns.push(profile);
      } catch (error) {
        columns.push({
          tableName,
          columnName: col.column_name,
          dataType: col.data_type,
          totalCount: rowCount,
          nullCount: 0,
          uniqueCount: 0,
          nullPercent: 0,
          uniquePercent: 0
        });
      }
    }

    return {
      tableName,
      rowCount,
      columnCount: columns.length,
      columns,
      profiledAt: new Date()
    };
  }

  private createDemoProfile(tableName: string): TableProfile {
    return {
      tableName,
      rowCount: 0,
      columnCount: 0,
      columns: [],
      profiledAt: new Date()
    };
  }

  private async profileColumn(tableName: string, columnName: string, dataType: string, totalCount: number): Promise<ColumnProfile> {
    const pool = getPool();
    const safeTable = escapeTableName(tableName);
    const safeColumn = escapeIdentifier(columnName);

    const statsResult = await safeQuery(
      pool,
      'profiler:columnStats',
      `SELECT 
        COUNT(*) - COUNT(${safeColumn}) as null_count,
        COUNT(DISTINCT ${safeColumn}) as unique_count
      FROM ${safeTable}`,
      []
    );

    const nullCount = parseInt(statsResult.rows[0].null_count);
    const uniqueCount = parseInt(statsResult.rows[0].unique_count);

    const profile: ColumnProfile = {
      tableName,
      columnName,
      dataType,
      totalCount,
      nullCount,
      uniqueCount,
      nullPercent: totalCount > 0 ? (nullCount / totalCount) * 100 : 0,
      uniquePercent: totalCount > 0 ? (uniqueCount / totalCount) * 100 : 0
    };

    if (this.isNumericType(dataType)) {
      try {
        const numericStats = await safeQuery(
          pool,
          'profiler:numericStats',
          `SELECT 
            MIN(${safeColumn}::numeric) as min_val,
            MAX(${safeColumn}::numeric) as max_val,
            AVG(${safeColumn}::numeric) as mean_val,
            STDDEV(${safeColumn}::numeric) as std_val,
            PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY ${safeColumn}::numeric) as p25,
            PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY ${safeColumn}::numeric) as p50,
            PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY ${safeColumn}::numeric) as p75,
            PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY ${safeColumn}::numeric) as p90,
            PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ${safeColumn}::numeric) as p95,
            PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY ${safeColumn}::numeric) as p99
          FROM ${safeTable}
          WHERE ${safeColumn} IS NOT NULL`,
          []
        );

        if (numericStats.rows[0]) {
          profile.minValue = String(numericStats.rows[0].min_val);
          profile.maxValue = String(numericStats.rows[0].max_val);
          profile.meanValue = parseFloat(numericStats.rows[0].mean_val);
          profile.stdDevValue = parseFloat(numericStats.rows[0].std_val);
          profile.percentiles = {
            p25: parseFloat(numericStats.rows[0].p25),
            p50: parseFloat(numericStats.rows[0].p50),
            p75: parseFloat(numericStats.rows[0].p75),
            p90: parseFloat(numericStats.rows[0].p90),
            p95: parseFloat(numericStats.rows[0].p95),
            p99: parseFloat(numericStats.rows[0].p99)
          };
        }
      } catch (e) {
      }
    } else if (this.isStringType(dataType)) {
      try {
        const minMaxResult = await safeQuery(
          pool,
          'profiler:stringMinMax',
          `SELECT MIN(${safeColumn}) as min_val, MAX(${safeColumn}) as max_val
          FROM ${safeTable}
          WHERE ${safeColumn} IS NOT NULL`,
          []
        );
        if (minMaxResult.rows[0]) {
          profile.minValue = minMaxResult.rows[0].min_val;
          profile.maxValue = minMaxResult.rows[0].max_val;
        }
      } catch (e) {
      }
    }

    try {
      const topValuesResult = await safeQuery(
        pool,
        'profiler:topValues',
        `SELECT ${safeColumn}::text as value, COUNT(*) as cnt
        FROM ${safeTable}
        WHERE ${safeColumn} IS NOT NULL
        GROUP BY ${safeColumn}
        ORDER BY cnt DESC
        LIMIT 10`,
        []
      );
      profile.topValues = topValuesResult.rows.map(r => ({
        value: String(r.value),
        count: parseInt(r.cnt)
      }));
    } catch (e) {
    }

    return profile;
  }

  private isNumericType(dataType: string): boolean {
    const numericTypes = ['integer', 'bigint', 'smallint', 'numeric', 'decimal', 'real', 'double precision', 'int', 'int4', 'int8', 'float4', 'float8'];
    return numericTypes.some(t => dataType.toLowerCase().includes(t));
  }

  private isStringType(dataType: string): boolean {
    const stringTypes = ['varchar', 'text', 'char', 'character'];
    return stringTypes.some(t => dataType.toLowerCase().includes(t));
  }

  async detectAnomalies(currentProfile: TableProfile, historicalProfiles: TableProfile[]): Promise<AnomalyDetection[]> {
    const anomalies: AnomalyDetection[] = [];

    if (historicalProfiles.length === 0) {
      return anomalies;
    }

    const recentProfiles = historicalProfiles.slice(-7);

    const avgRowCount = recentProfiles.reduce((sum, p) => sum + p.rowCount, 0) / recentProfiles.length;
    const rowCountStdDev = Math.sqrt(
      recentProfiles.reduce((sum, p) => sum + Math.pow(p.rowCount - avgRowCount, 2), 0) / recentProfiles.length
    );

    if (rowCountStdDev > 0) {
      const zScore = (currentProfile.rowCount - avgRowCount) / rowCountStdDev;
      
      if (zScore > 3) {
        anomalies.push({
          tableName: currentProfile.tableName,
          anomalyType: 'spike',
          severity: zScore > 5 ? 'critical' : 'warning',
          description: `Row count spike detected: ${currentProfile.rowCount} rows (${Math.round((currentProfile.rowCount / avgRowCount - 1) * 100)}% increase)`,
          expectedBaseline: String(Math.round(avgRowCount)),
          actualValue: String(currentProfile.rowCount),
          deviationScore: zScore
        });
      } else if (zScore < -3) {
        anomalies.push({
          tableName: currentProfile.tableName,
          anomalyType: 'drop',
          severity: zScore < -5 ? 'critical' : 'warning',
          description: `Row count drop detected: ${currentProfile.rowCount} rows (${Math.round((1 - currentProfile.rowCount / avgRowCount) * 100)}% decrease)`,
          expectedBaseline: String(Math.round(avgRowCount)),
          actualValue: String(currentProfile.rowCount),
          deviationScore: Math.abs(zScore)
        });
      }
    }

    for (const column of currentProfile.columns) {
      const historicalNullPercents = recentProfiles
        .map(p => p.columns.find(c => c.columnName === column.columnName)?.nullPercent)
        .filter((v): v is number => v !== undefined);

      if (historicalNullPercents.length > 0) {
        const avgNullPercent = historicalNullPercents.reduce((a, b) => a + b, 0) / historicalNullPercents.length;
        const nullPercentDiff = column.nullPercent - avgNullPercent;

        if (nullPercentDiff > 10) {
          anomalies.push({
            tableName: currentProfile.tableName,
            columnName: column.columnName,
            anomalyType: 'missing_data',
            severity: nullPercentDiff > 25 ? 'critical' : 'warning',
            description: `Null percentage increased from ${avgNullPercent.toFixed(1)}% to ${column.nullPercent.toFixed(1)}%`,
            expectedBaseline: `${avgNullPercent.toFixed(1)}%`,
            actualValue: `${column.nullPercent.toFixed(1)}%`,
            deviationScore: nullPercentDiff
          });
        }
      }

      if (column.meanValue !== undefined && column.stdDevValue !== undefined) {
        const historicalMeans = recentProfiles
          .map(p => p.columns.find(c => c.columnName === column.columnName)?.meanValue)
          .filter((v): v is number => v !== undefined);

        if (historicalMeans.length > 0) {
          const avgMean = historicalMeans.reduce((a, b) => a + b, 0) / historicalMeans.length;
          const meanStdDev = Math.sqrt(
            historicalMeans.reduce((sum, m) => sum + Math.pow(m - avgMean, 2), 0) / historicalMeans.length
          );

          if (meanStdDev > 0) {
            const zScore = (column.meanValue - avgMean) / meanStdDev;
            if (Math.abs(zScore) > 3) {
              anomalies.push({
                tableName: currentProfile.tableName,
                columnName: column.columnName,
                anomalyType: 'drift',
                severity: Math.abs(zScore) > 5 ? 'critical' : 'warning',
                description: `Mean value drift detected: ${column.meanValue.toFixed(2)} vs expected ${avgMean.toFixed(2)}`,
                expectedBaseline: avgMean.toFixed(2),
                actualValue: column.meanValue.toFixed(2),
                deviationScore: Math.abs(zScore)
              });
            }
          }
        }
      }
    }

    const lastProfile = historicalProfiles[historicalProfiles.length - 1];
    if (lastProfile) {
      const lastColumns = new Set(lastProfile.columns.map(c => c.columnName));
      const currentColumns = new Set(currentProfile.columns.map(c => c.columnName));

      for (const col of currentProfile.columns) {
        if (!lastColumns.has(col.columnName)) {
          anomalies.push({
            tableName: currentProfile.tableName,
            columnName: col.columnName,
            anomalyType: 'schema_change',
            severity: 'info',
            description: `New column detected: ${col.columnName}`,
            expectedBaseline: 'column not present',
            actualValue: 'column added',
            deviationScore: 1
          });
        }
      }

      for (const col of lastProfile.columns) {
        if (!currentColumns.has(col.columnName)) {
          anomalies.push({
            tableName: currentProfile.tableName,
            columnName: col.columnName,
            anomalyType: 'schema_change',
            severity: 'critical',
            description: `Column removed: ${col.columnName}`,
            expectedBaseline: 'column present',
            actualValue: 'column missing',
            deviationScore: 10
          });
        }
      }
    }

    return anomalies;
  }

  async getHistoricalProfiles(tableName: string, limit: number = 30): Promise<TableProfile[]> {
    if (isDemoMode()) {
      return [];
    }

    const pool = getPool();
    
    try {
      const result = await safeQuery(
        pool,
        'profiler:historicalProfiles',
        `SELECT 
          dp.run_id,
          dp.table_name,
          dp.column_name,
          dp.data_type,
          dp.total_count,
          dp.null_count,
          dp.unique_count,
          dp.min_value,
          dp.max_value,
          dp.mean_value,
          dp.std_dev_value,
          dp.percentiles,
          dp.top_values,
          dp.profiled_at,
          qr.started_at
        FROM data_profiles dp
        JOIN quality_runs qr ON dp.run_id = qr.id
        WHERE dp.table_name = $1
        ORDER BY dp.profiled_at DESC
        LIMIT $2`,
        [tableName, limit * 20]
      );

      const profilesByRun: Record<string, any[]> = {};
      for (const row of result.rows) {
        if (!profilesByRun[row.run_id]) {
          profilesByRun[row.run_id] = [];
        }
        profilesByRun[row.run_id].push(row);
      }

      const profiles: TableProfile[] = [];
      for (const runId of Object.keys(profilesByRun)) {
        const rows = profilesByRun[runId];
        if (profiles.length >= limit) break;
        
        const columns: ColumnProfile[] = rows.map(r => ({
          tableName: r.table_name,
          columnName: r.column_name,
          dataType: r.data_type,
          totalCount: r.total_count,
          nullCount: r.null_count,
          uniqueCount: r.unique_count,
          nullPercent: r.total_count > 0 ? (r.null_count / r.total_count) * 100 : 0,
          uniquePercent: r.total_count > 0 ? (r.unique_count / r.total_count) * 100 : 0,
          minValue: r.min_value,
          maxValue: r.max_value,
          meanValue: r.mean_value,
          stdDevValue: r.std_dev_value,
          percentiles: r.percentiles,
          topValues: r.top_values
        }));

        profiles.push({
          tableName,
          rowCount: rows[0]?.total_count || 0,
          columnCount: columns.length,
          columns,
          profiledAt: new Date(rows[0].profiled_at)
        });
      }

      return profiles.reverse();
    } catch (e) {
      return [];
    }
  }
}

export const dataProfiler = new DataProfiler();
