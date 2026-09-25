import { db } from '../db/pool';
import crypto from 'crypto';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

export type InternetPolicyMode = 'OPEN' | 'RESTRICTED' | 'OFFLINE';

export const DOMAIN_ECOSYSTEMS: Record<string, string[]> = {
  'youtube.com': ['youtube.com', 'youtu.be', 'googlevideo.com', 'ytimg.com', 'youtubei.googleapis.com', 'yt3.ggpht.com'],
  'youtu.be': ['youtube.com', 'youtu.be', 'googlevideo.com', 'ytimg.com', 'youtubei.googleapis.com', 'yt3.ggpht.com'],
  'tiktok.com': ['tiktok.com', 'tiktokv.com', 'tiktokcdn.com', 'musical.ly'],
  'facebook.com': ['facebook.com', 'fbcdn.net', 'fb.com', 'messenger.com'],
  'instagram.com': ['instagram.com', 'cdninstagram.com'],
  'twitter.com': ['twitter.com', 't.co', 'twimg.com', 'x.com'],
  'x.com': ['x.com', 'twitter.com', 't.co', 'twimg.com']
};

export class InternetPolicyService {
  /**
   * Normalizes domain names (strips protocols, paths, ports, wildcards, and whitespace)
   */
  public normalizeDomain(rawDomain: string): string {
    return (rawDomain || '')
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//i, '')
      .replace(/\/.*$/, '')
      .replace(/:\d+$/, '')
      .replace(/^\*\./, '')
      .replace(/^www\./i, '')
      .trim();
  }

  async getPolicyMode(): Promise<InternetPolicyMode> {
    const { rows } = await db.query("SELECT value FROM system_settings WHERE key = 'internet_policy_mode'");
    if (rows.length > 0) {
      const val = rows[0].value;
      const clean = typeof val === 'string' ? val.replace(/"/g, '') : String(val);
      if (clean === 'OPEN' || clean === 'RESTRICTED' || clean === 'OFFLINE') {
        return clean as InternetPolicyMode;
      }
    }
    return 'RESTRICTED';
  }

  async setPolicyMode(mode: InternetPolicyMode) {
    await db.query(
      `INSERT INTO system_settings (key, value) VALUES ('internet_policy_mode', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [JSON.stringify(mode)]
    );
    // Automatically synchronize local Windows proxy if applicable
    this.syncLocalWindowsProxy(undefined, mode).catch(() => {});
    return { success: true };
  }

  async getExcludeServer(): Promise<boolean> {
    const { rows } = await db.query("SELECT value FROM system_settings WHERE key = 'internet_policy_exclude_server'");
    if (rows.length > 0) {
      const val = rows[0].value;
      return val === true || val === 'true';
    }
    return false; // Default is false so policy is active on the server machine out of the box
  }

  async setExcludeServer(exclude: boolean) {
    await db.query(
      `INSERT INTO system_settings (key, value) VALUES ('internet_policy_exclude_server', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [JSON.stringify(exclude)]
    );
    // Automatically synchronize local Windows proxy if applicable
    this.syncLocalWindowsProxy(exclude).catch(() => {});
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
    this.syncLocalWindowsProxy().catch(() => {});
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

  async createBlockedSite(domain: string, categoryId: string | null, addedBy: string | null) {
    const cleanDomain = this.normalizeDomain(domain);
    if (!cleanDomain) throw new Error('Domain cannot be empty');

    // Automatically expand multi-domain ecosystems (e.g. YouTube player, CDNs, shortlinks)
    const ecosystem = DOMAIN_ECOSYSTEMS[cleanDomain];
    if (ecosystem && ecosystem.length > 1) {
      await this.createBlockedSitesBulk(ecosystem, categoryId, addedBy);
      const { rows } = await db.query('SELECT * FROM blocked_sites WHERE domain = $1', [cleanDomain]);
      return rows[0] || { domain: cleanDomain, is_active: true };
    }

    const id = crypto.randomUUID();
    const { rows } = await db.query(
      `INSERT INTO blocked_sites (id, domain, category_id, added_by, is_active)
       VALUES ($1, $2, $3, $4, true)
       ON CONFLICT (domain) DO UPDATE SET category_id = EXCLUDED.category_id, is_active = true
       RETURNING *`,
      [id, cleanDomain, categoryId || null, addedBy || null]
    );
    this.syncLocalWindowsProxy().catch(() => {});
    return rows[0];
  }

  async createBlockedSitesBulk(domains: string[], categoryId: string | null, addedBy: string | null) {
    if (domains.length === 0) return { count: 0 };
    
    // Automatically expand ecosystems (e.g. including googlevideo, ytimg when youtube is added)
    const expandedDomains: string[] = [];
    for (const d of domains) {
      const clean = this.normalizeDomain(d);
      if (!clean) continue;
      expandedDomains.push(clean);
      if (DOMAIN_ECOSYSTEMS[clean]) {
        for (const ecoDomain of DOMAIN_ECOSYSTEMS[clean]) {
          expandedDomains.push(ecoDomain);
        }
      }
    }

    // Batch insert with domain normalization and deduplication
    const values: any[] = [];
    const placeholders: string[] = [];
    let count = 1;
    const seen = new Set<string>();
    
    for (const domainClean of expandedDomains) {
      if (seen.has(domainClean)) continue;
      seen.add(domainClean);
      
      const id = crypto.randomUUID();
      placeholders.push(`($${count}, $${count+1}, $${count+2}, $${count+3}, true)`);
      values.push(id, domainClean, categoryId || null, addedBy || null);
      count += 4;
    }
    
    if (placeholders.length === 0) return { count: 0 };

    await db.query(
      `INSERT INTO blocked_sites (id, domain, category_id, added_by, is_active) 
       VALUES ${placeholders.join(', ')} 
       ON CONFLICT (domain) DO UPDATE SET category_id = EXCLUDED.category_id, is_active = true`,
      values
    );
    
    this.syncLocalWindowsProxy().catch(() => {});
    return { count: placeholders.length };
  }

  async updateBlockedSite(id: string, domain: string, categoryId: string | null, isActive: boolean) {
    const cleanDomain = this.normalizeDomain(domain);
    const { rows } = await db.query(
      'UPDATE blocked_sites SET domain = $1, category_id = $2, is_active = $3 WHERE id = $4 RETURNING *',
      [cleanDomain, categoryId, isActive, id]
    );
    this.syncLocalWindowsProxy().catch(() => {});
    return rows[0];
  }

  async deleteBlockedSite(id: string) {
    await db.query('DELETE FROM blocked_sites WHERE id = $1', [id]);
    this.syncLocalWindowsProxy().catch(() => {});
    return { success: true };
  }

  /**
   * Synchronizes Windows system proxy settings on the local machine
   * When excludeServer is true: clears local AutoConfigURL (admin PC has full direct access).
   * When excludeServer is false: configures AutoConfigURL (admin PC is subject to the same blocklist as students).
   */
  async syncLocalWindowsProxy(excludeServerOverride?: boolean, modeOverride?: InternetPolicyMode): Promise<{
    success: boolean;
    configured: boolean;
    autoConfigUrl: string | null;
  }> {
    if (process.platform !== 'win32') {
      return { success: true, configured: false, autoConfigUrl: null };
    }

    try {
      const excludeServer = excludeServerOverride !== undefined ? excludeServerOverride : await this.getExcludeServer();
      const mode = modeOverride !== undefined ? modeOverride : await this.getPolicyMode();

      const executePowerShell = async (psScript: string) => {
        const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
        return execPromise(`powershell -NoProfile -NonInteractive -EncodedCommand ${encoded}`);
      };

      // If Server is excluded, or if Policy is OPEN: clear AutoConfigURL so admin has full direct internet
      if (excludeServer || mode === 'OPEN') {
        const clearScript = `
Remove-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings' -Name AutoConfigURL -ErrorAction SilentlyContinue
Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings' -Name ProxyEnable -Value 0 -Type DWord -ErrorAction SilentlyContinue
try {
  $sig = @'
  [DllImport("wininet.dll", SetLastError = true, CharSet=CharSet.Auto)]
  public static extern bool InternetSetOption(IntPtr hInternet, int dwOption, IntPtr lpBuffer, int dwBufferLength);
'@
  $wininet = Add-Type -MemberDefinition $sig -Name "WinINet_Clear_${Date.now()}" -Namespace "Win32" -PassThru -ErrorAction SilentlyContinue
  if ($wininet) {
    $wininet::InternetSetOption([IntPtr]::Zero, 39, [IntPtr]::Zero, 0)
    $wininet::InternetSetOption([IntPtr]::Zero, 37, [IntPtr]::Zero, 0)
  }
} catch {}
`;
        await executePowerShell(clearScript);
        return { success: true, configured: false, autoConfigUrl: null };
      } else {
        // Server is NOT excluded (apply policy to Admin PC just like students!)
        // Dynamic query timestamp forces Windows and Chromium to invalidate any cached PAC script immediately
        const pacUrl = `http://127.0.0.1:3000/api/v1/internet-policy/proxy.pac?v=${Date.now()}`;
        const setScript = `
Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings' -Name AutoConfigURL -Value '${pacUrl}' -Type String
Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings' -Name ProxyEnable -Value 0 -Type DWord

# Enforce disabling QUIC in Chrome & Edge so video streaming/traffic cannot bypass the PAC proxy via UDP 443
try {
  New-Item -Path 'HKCU:\\Software\\Policies\\Google\\Chrome' -Force -ErrorAction SilentlyContinue | Out-Null
  Set-ItemProperty -Path 'HKCU:\\Software\\Policies\\Google\\Chrome' -Name 'QuicAllowed' -Value 0 -Type DWord -ErrorAction SilentlyContinue
  New-Item -Path 'HKCU:\\Software\\Policies\\Microsoft\\Edge' -Force -ErrorAction SilentlyContinue | Out-Null
  Set-ItemProperty -Path 'HKCU:\\Software\\Policies\\Microsoft\\Edge' -Name 'QuicAllowed' -Value 0 -Type DWord -ErrorAction SilentlyContinue
} catch {}

try {
  netsh advfirewall firewall add rule name="MISHKAT Block QUIC (UDP 443)" dir=out action=block protocol=UDP remoteport=443 | Out-Null
} catch {}

try {
  $sig = @'
  [DllImport("wininet.dll", SetLastError = true, CharSet=CharSet.Auto)]
  public static extern bool InternetSetOption(IntPtr hInternet, int dwOption, IntPtr lpBuffer, int dwBufferLength);
'@
  $wininet = Add-Type -MemberDefinition $sig -Name "WinINet_Set_${Date.now()}" -Namespace "Win32" -PassThru -ErrorAction SilentlyContinue
  if ($wininet) {
    $wininet::InternetSetOption([IntPtr]::Zero, 39, [IntPtr]::Zero, 0)
    $wininet::InternetSetOption([IntPtr]::Zero, 37, [IntPtr]::Zero, 0)
  }
} catch {}
`;
        await executePowerShell(setScript);
        return { success: true, configured: true, autoConfigUrl: pacUrl };
      }
    } catch (err: any) {
      console.warn('⚠️ [InternetPolicy] Failed to sync local Windows proxy:', err.message);
      return { success: false, configured: false, autoConfigUrl: null };
    }
  }

  /**
   * Retrieves current local Windows proxy configuration status
   */
  async getLocalWindowsProxyStatus(): Promise<{ configured: boolean; autoConfigUrl: string | null }> {
    if (process.platform !== 'win32') {
      return { configured: false, autoConfigUrl: null };
    }
    try {
      const { stdout } = await execPromise(
        'powershell -NoProfile -NonInteractive -Command "(Get-ItemProperty -Path \'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings\' -ErrorAction SilentlyContinue).AutoConfigURL"'
      );
      const url = (stdout || '').trim();
      return { configured: !!url, autoConfigUrl: url || null };
    } catch {
      return { configured: false, autoConfigUrl: null };
    }
  }
}

export const internetPolicyService = new InternetPolicyService();
