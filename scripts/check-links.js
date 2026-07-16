import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getSiteUrl, checkUrlWithRetry, verifyBacklinkPresence } from './link-utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const DATA_DIR = path.join(__dirname, '../src/data');
const SITE_URL = getSiteUrl();

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
};

// Statistics
const stats = {
    total: 0,
    success: 0,
    failed: 0,
    errors: []
};

async function processFile(filePath, type) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(content);
        const name = data.name || path.basename(filePath, '.json');
        
        // Skip check if vip is true
        if (data.vip) {
            console.log(`${colors.cyan}${name}${colors.reset}：${colors.yellow}VIP (Skipped)${colors.reset}`);
            stats.total++;
            stats.success++; // Count as success to avoid triggering failure report
            return;
        }

        let urlResult = { ok: false, status: 'N/A' };
        let avatarResult = { ok: false, status: 'N/A' };
        let backlinkResult = { ok: true, status: 'N/A' };

        // Check URL (for friends)
        if (data.url) {
            stats.total++;
            let checkUrlTarget = data.url;
            // Handle local paths or paths without protocol
            if (checkUrlTarget.startsWith('/')) {
                if (SITE_URL) checkUrlTarget = SITE_URL + checkUrlTarget;
            } else if (!checkUrlTarget.startsWith('http') && SITE_URL) {
                checkUrlTarget = SITE_URL + '/' + checkUrlTarget.replace(/^\/+/, '');
            }

            urlResult = await checkUrlWithRetry(checkUrlTarget);
            if (urlResult.ok) {
                stats.success++;
            } else {
                stats.failed++;
                stats.errors.push({ type, name, field: 'url', value: data.url, error: urlResult.status });
            }
        }

        // Check Backlink if present
        if (data.url && urlResult.ok && data.backlink && SITE_URL) {
            stats.total++;
            const backlinkCheck = await checkUrlWithRetry(data.backlink);
            if (backlinkCheck.ok) {
                const found = verifyBacklinkPresence(backlinkCheck.body, SITE_URL);
                if (found) {
                    backlinkResult = { ok: true, status: 'Found' };
                    stats.success++;
                } else {
                    backlinkResult = { ok: false, status: 'Backlink Missing' };
                    stats.failed++;
                    stats.errors.push({ type, name, field: 'backlink', value: data.backlink, error: 'Backlink not found on page' });
                }
            } else {
                backlinkResult = { ok: false, status: backlinkCheck.status };
                stats.failed++;
                stats.errors.push({ type, name, field: 'backlink', value: data.backlink, error: backlinkCheck.status });
            }
        }

        // URL 或反向链接失败时只报告，不在无人审核的定时任务中删除文件。
        const hasPrimaryFailure = (data.url && !urlResult.ok && urlResult.status !== 'N/A') || (data.backlink && !backlinkResult.ok);
        
        if (hasPrimaryFailure) {
             // Print output for failed checks
             let output = `${colors.cyan}${name}${colors.reset}：`;
             if (!urlResult.ok && urlResult.status !== 'N/A') output += `url：${colors.red}${urlResult.status}${colors.reset} `;
             if (data.backlink && !backlinkResult.ok) output += `backlink：${colors.red}${backlinkResult.status}${colors.reset}`;
             console.log(output);
             console.log(`${colors.yellow}REPORTED only; no file was deleted.${colors.reset}`);
        }

        // Check Avatar
        if (data.avatar) {
            stats.total++;
            let avatarTarget = data.avatar;
            if (avatarTarget.startsWith('/')) {
                if (SITE_URL) avatarTarget = SITE_URL + avatarTarget;
            } else if (!avatarTarget.startsWith('http') && SITE_URL) {
                avatarTarget = SITE_URL + '/' + avatarTarget.replace(/^\/+/, '');
            }

            avatarResult = await checkUrlWithRetry(avatarTarget);
            if (avatarResult.ok) {
                stats.success++;
            } else {
                stats.failed++;
                stats.errors.push({ type, name, field: 'avatar', value: data.avatar, error: avatarResult.status });
            }
        }

        // Format output
        let output = `${colors.cyan}${name}${colors.reset}：`;
        
        if (data.url) {
            const statusColor = urlResult.ok ? colors.green : colors.red;
            output += `url：${statusColor}${urlResult.status}${colors.reset}`;
        }

        if (data.avatar) {
            const statusColor = avatarResult.ok ? colors.green : colors.red;
            output += `， avatar: ${statusColor}${avatarResult.status}${colors.reset}`;
        }

        if (data.backlink) {
            const statusColor = backlinkResult.ok ? colors.green : colors.red;
            output += `， backlink: ${statusColor}${backlinkResult.status}${colors.reset}`;
        }

        console.log(output);

    } catch (err) {
        console.error(`${colors.red}Error processing file ${filePath}: ${err.message}${colors.reset}`);
    }
}

async function scanDirectory(dirName, type) {
    const dirPath = path.join(DATA_DIR, dirName);
    if (!fs.existsSync(dirPath)) {
        console.log(`${colors.yellow}Directory ${dirName} not found, skipping.${colors.reset}`);
        return;
    }

    const files = fs.readdirSync(dirPath).filter(file => file.endsWith('.json'));
    console.log(`\n${colors.blue}Scanning ${type} (${files.length} files)...${colors.reset}\n`);

    for (const file of files) {
        await processFile(path.join(dirPath, file), type);
    }
}

async function main() {
    console.log(`${colors.magenta}=== Starting Link Checker ===${colors.reset}`);
    
    await scanDirectory('friends', 'Friend');
    await scanDirectory('sponsors', 'Sponsor');

    console.log(`\n${colors.magenta}=== Summary ===${colors.reset}`);
    console.log(`Total checks: ${stats.total}`);
    console.log(`Successful: ${colors.green}${stats.success}${colors.reset}`);
    console.log(`Failed: ${colors.red}${stats.failed}${colors.reset}`);

    if (stats.errors.length > 0) {
        console.log(`\n${colors.red}=== Failures Details ===${colors.reset}`);
        stats.errors.forEach(err => {
            console.log(`[${err.type}] ${err.name} - ${err.field}: ${err.error} (${err.value})`);
        });
        
        // Output for GitHub Actions Summary
        if (process.env.GITHUB_STEP_SUMMARY) {
            const summaryPath = process.env.GITHUB_STEP_SUMMARY;
            let summary = '## ❌ Link Check Failures\n\n';
            summary += 'The following issues were detected during the link check process:\n\n';
            
            summary += '| Type | Name | Field | Error | Action | URL |\n';
            summary += '|------|------|-------|-------|--------|-----|\n';
            
            stats.errors.forEach(err => {
                const action = '⚠️ Reported';
                summary += `| ${err.type} | ${err.name} | ${err.field} | ${err.error} | ${action} | ${err.value} |\n`;
            });
            
            summary += '\n> **Note**: Link failures are reported only. No data files are deleted automatically.\n';
            
            fs.appendFileSync(summaryPath, summary);
        }
        
        // 标记工作流失败以提醒维护者查看报告，但不修改仓库内容。
        process.exit(1); 
    } else {
        if (process.env.GITHUB_STEP_SUMMARY) {
            const summaryPath = process.env.GITHUB_STEP_SUMMARY;
            fs.appendFileSync(summaryPath, '## ✅ All Links are Healthy!\n');
        }
        process.exit(0);
    }
}

main();
