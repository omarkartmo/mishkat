import { db } from '../db/pool';
import crypto from 'crypto';

export type InternetPolicyMode = 'OPEN' | 'RESTRICTED' | 'OFFLINE';

export class InternetPolicyService {
  async getPolicyMode(): Promise<InternetPolicyMode> {
    const { rows } = await db.query("SELECT value FROM system_settings WHERE key = 'internet_policy_mode'");
    if (rows.length > 0) {
      return rows[0].value as InternetPolicyMode;
    }
    return 'RESTRICTED';
  }

  async setPolicyMode(mode: InternetPolicyMode) {
    await db.query(
      `INSERT INTO system_settings (key, value) VALUES ('internet_policy_mode', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [JSON.stringify(mode)]
    );
    return { success: true };
  }

  async getExcludeServer(): Promise<boolean> {
    const { rows } = await db.query("SELECT value FROM system_settings WHERE key = 'internet_policy_exclude_server'");
    if (rows.length > 0) {
      const val = rows[0].value;
      return val === true || val === 'true';
    }
    return true; // Default is true as requested
  }

  async setExcludeServer(exclude: boolean) {
    await db.query(
      `INSERT INTO system_settings (key, value) VALUES ('internet_policy_exclude_server', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [JSON.stringify(exclude)]
    );
    return { success: true };
  }

  async getCategories() {
    const { rows } = await db.query('SELECT * FROM blocked_categories ORDER BY name ASC');
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      isActive: r.is_active,
      createdAt: r.created_at
    }));
  }

  async createCategory(name: string) {
    const id = crypto.randomUUID();
    const { rows } = await db.query(
      'INSERT INTO blocked_categories (id, name, is_active) VALUES ($1, $2, true) RETURNING *',
      [id, name]
    );
    return rows[0];
  }

  async updateCategory(id: string, name: string, isActive: boolean) {
    const { rows } = await db.query(
      'UPDATE blocked_categories SET name = $1, is_active = $2 WHERE id = $3 RETURNING *',
      [name, isActive, id]
    );
    return rows[0];
  }

  async deleteCategory(id: string) {
    await db.query('DELETE FROM blocked_sites WHERE category_id = $1', [id]);
    await db.query('DELETE FROM blocked_categories WHERE id = $1', [id]);
    return { success: true };
  }

  async getBlockedSites() {
    const { rows } = await db.query(`
      SELECT s.*, c.name as category_name
      FROM blocked_sites s
      LEFT JOIN blocked_categories c ON s.category_id = c.id
      ORDER BY s.domain ASC
    `);
    return rows.map(r => ({
      id: r.id,
      domain: r.domain,
      categoryId: r.category_id,
      categoryName: r.category_name,
      isActive: r.is_active,
      addedBy: r.added_by,
      createdAt: r.created_at
    }));
  }

  async createBlockedSite(domain: string, categoryId: string | null, addedBy: string) {
    const id = crypto.randomUUID();
    const { rows } = await db.query(
      'INSERT INTO blocked_sites (id, domain, category_id, added_by, is_active) VALUES ($1, $2, $3, $4, true) RETURNING *',
      [id, domain.toLowerCase(), categoryId, addedBy]
    );
    return rows[0];
  }

  async createBlockedSitesBulk(domains: string[], categoryId: string | null, addedBy: string) {
    if (domains.length === 0) return { count: 0 };
    
    // Batch insert
    const values: any[] = [];
    const placeholders: string[] = [];
    let count = 1;
    
    for (const d of domains) {
      const domainClean = d.trim().toLowerCase();
      if (!domainClean) continue;
      
      const id = crypto.randomUUID();
      placeholders.push(`($${count}, $${count+1}, $${count+2}, $${count+3}, true)`);
      values.push(id, domainClean, categoryId, addedBy);
      count += 4;
    }
    
    if (placeholders.length === 0) return { count: 0 };

    await db.query(
      `INSERT INTO blocked_sites (id, domain, category_id, added_by, is_active) 
       VALUES ${placeholders.join(', ')} 
       ON CONFLICT (domain) DO UPDATE SET category_id = EXCLUDED.category_id, is_active = true`,
      values
    );
    
    return { count: placeholders.length };
  }

  async updateBlockedSite(id: string, domain: string, categoryId: string | null, isActive: boolean) {
    const { rows } = await db.query(
      'UPDATE blocked_sites SET domain = $1, category_id = $2, is_active = $3 WHERE id = $4 RETURNING *',
      [domain, categoryId, isActive, id]
    );
    return rows[0];
  }

  async deleteBlockedSite(id: string) {
    await db.query('DELETE FROM blocked_sites WHERE id = $1', [id]);
    return { success: true };
  }
}

export const internetPolicyService = new InternetPolicyService();
