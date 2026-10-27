import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '../server/db/pool';
import { runMigrations } from '../server/db/migrator';
import { supportAgentService } from '../server/services/supportAgentService';

describe('Support Queue Error Deduplication & Multi-Device Aggregation', () => {
  beforeAll(async () => {
    // Run pending migrations (including 015)
    await runMigrations();

    // Clean test queue
    await db.query(`DELETE FROM support_outbound_queue WHERE component = 'test-dedup-component'`);
  });

  it('should aggregate repeated automated telemetry errors across multiple devices into a single report', async () => {
    const errorDetails = {
      sourceType: 'client' as const,
      clientDeviceId: 'stu_device_alpha',
      userRole: 'student',
      component: 'test-dedup-component',
      errorType: 'server_error',
      errorCode: 'PG_VARCHAR_OVERFLOW',
      severity: 'critical' as const,
      message: 'value too long for type character varying(50)',
    };

    // 1. First occurrence from device Alpha
    const id1 = await supportAgentService.enqueueOutboundReport(errorDetails);
    expect(id1).toBeDefined();

    const { rows: rowsAfter1 } = await db.query(
      `SELECT * FROM support_outbound_queue WHERE report_id = $1`,
      [id1]
    );
    expect(rowsAfter1.length).toBe(1);
    expect(Number(rowsAfter1[0].occurrence_count)).toBe(1);
    expect(Number(rowsAfter1[0].affected_devices_count)).toBe(1);
    let devIds1 = Array.isArray(rowsAfter1[0].affected_device_ids)
      ? rowsAfter1[0].affected_device_ids
      : JSON.parse(rowsAfter1[0].affected_device_ids || '[]');
    expect(devIds1).toContain('stu_device_alpha');

    // 2. Second occurrence of the exact same error from device Beta
    const id2 = await supportAgentService.enqueueOutboundReport({
      ...errorDetails,
      clientDeviceId: 'stu_device_beta',
    });

    // Must return the SAME report ID (deduplicated)
    expect(id2).toBe(id1);

    const { rows: rowsAfter2 } = await db.query(
      `SELECT * FROM support_outbound_queue WHERE report_id = $1`,
      [id1]
    );
    expect(rowsAfter2.length).toBe(1);
    expect(Number(rowsAfter2[0].occurrence_count)).toBe(2);
    expect(Number(rowsAfter2[0].affected_devices_count)).toBe(2);
    let devIds2 = Array.isArray(rowsAfter2[0].affected_device_ids)
      ? rowsAfter2[0].affected_device_ids
      : JSON.parse(rowsAfter2[0].affected_device_ids || '[]');
    expect(devIds2).toContain('stu_device_alpha');
    expect(devIds2).toContain('stu_device_beta');

    // 3. Third occurrence from device Alpha again
    const id3 = await supportAgentService.enqueueOutboundReport({
      ...errorDetails,
      clientDeviceId: 'stu_device_alpha',
    });
    expect(id3).toBe(id1);

    const { rows: rowsAfter3 } = await db.query(
      `SELECT * FROM support_outbound_queue WHERE report_id = $1`,
      [id1]
    );
    expect(Number(rowsAfter3[0].occurrence_count)).toBe(3);
    // Devices count remains 2 (alpha and beta)
    expect(Number(rowsAfter3[0].affected_devices_count)).toBe(2);
  });

  it('should aggregate repeated manual problem reports with matching description', async () => {
    const manualReport = {
      sourceType: 'client' as const,
      clientDeviceId: 'station_lab_101',
      userRole: 'student',
      component: 'test-dedup-component',
      errorType: 'manual_report',
      errorCode: 'USER_REPORTED_PROBLEM',
      severity: 'info' as const,
      message: 'شاشة القراءة بطيئة في تقليب الصفحات',
    };

    const id1 = await supportAgentService.enqueueOutboundReport(manualReport);

    const id2 = await supportAgentService.enqueueOutboundReport({
      ...manualReport,
      clientDeviceId: 'station_lab_102',
    });

    expect(id2).toBe(id1);

    const { rows } = await db.query(
      `SELECT * FROM support_outbound_queue WHERE report_id = $1`,
      [id1]
    );
    expect(Number(rows[0].occurrence_count)).toBe(2);
    expect(Number(rows[0].affected_devices_count)).toBe(2);
  });
});
