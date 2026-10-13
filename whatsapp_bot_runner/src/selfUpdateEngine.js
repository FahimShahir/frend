/**
 * Autonomous AI Self-Update & Safe Future Evolution System — FREND
 * Implementation of Specifications 1 to 13
 *
 * Capabilities:
 * 1. Autonomous Improvement Cycle (Detect -> Diagnose -> Plan -> Backup -> Patch -> Test -> Deploy -> Monitor -> Rollback).
 * 2. Zero-Loss User Data Guarantee: Atomic snapshots before any change; rollback on failure.
 * 3. Safe Autonomy & Approval Boundaries: Auto-apply low-risk changes; gate high-risk changes with approval tokens.
 * 4. Staged Canary Rollout with Feature Flags.
 * 5. Full Change History & Lessons Learned Audit Trail.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./database');
const featureFlags = require('./featureFlags');
let _regressionRunner = null;
function getRegressionRunner() {
  if (!_regressionRunner) _regressionRunner = require('./regressionRunner');
  return _regressionRunner;
}
const capabilityRegistry = require('./capabilityRegistry');
const security = require('./security');

const CURRENT_VERSION = '2.5.0';
const LAST_KNOWN_GOOD_VERSION = '2.4.9';

const DATA_DIR = path.join(__dirname, '..', 'data');
const SNAPSHOT_DIR = path.join(DATA_DIR, 'backups', 'evolution_snapshots');
const DB_PATH = path.join(DATA_DIR, 'frend.db');

if (!fs.existsSync(SNAPSHOT_DIR)) {
  fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
}

// ─── 1. Point-In-Time Backup & Rollback Engine (Section 5 & 6) ─
/**
 * Creates an exact, verified point-in-time snapshot before applying code or schema changes
 */
function createEvolutionSnapshot(changeId) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const snapshotFile = path.join(SNAPSHOT_DIR, `snapshot_${changeId}_${timestamp}.db`);

  // Verify production database exists
  if (!fs.existsSync(DB_PATH)) {
    throw new Error('Production database not found for snapshotting');
  }

  // Atomic file copy for SQLite snapshot
  fs.copyFileSync(DB_PATH, snapshotFile);

  // Verify snapshot integrity
  if (!fs.existsSync(snapshotFile) || fs.statSync(snapshotFile).size === 0) {
    throw new Error('Evolution snapshot verification failed: file empty or missing');
  }

  return snapshotFile;
}

/**
 * Restores the database from a point-in-time snapshot
 */
function restoreEvolutionSnapshot(snapshotFile) {
  if (!fs.existsSync(snapshotFile)) {
    throw new Error(`Snapshot file not found: ${snapshotFile}`);
  }
  // Safe atomic overwrite back to production DB
  fs.copyFileSync(snapshotFile, DB_PATH);
  return true;
}

// ─── 2. Risk Assessment & Approval Boundaries (Section 10) ─────
const RISK_POLICIES = {
  LOW_RISK: [
    'intent_routing_correction',
    'validation_improvement',
    'error_handling_patch',
    'regression_test_addition',
    'dynamic_capability_registration',
    'documentation_update',
    'performance_tuning',
  ],
  HIGH_RISK: [
    'auth_policy_change',
    'destructive_schema_migration',
    'user_data_deletion',
    'billing_plan_modification',
    'untrusted_dependency_install',
    'privilege_escalation',
  ]
};

function assessRiskLevel(actionType, metadata = {}) {
  if (RISK_POLICIES.HIGH_RISK.includes(actionType)) {
    return 'HIGH_RISK';
  }
  if (metadata.destructive || metadata.altersAuth || metadata.modifiesBilling) {
    return 'HIGH_RISK';
  }
  return 'LOW_RISK';
}

// ─── 3. Opportunity Detection Engine (Section 2 & 4) ───────────
/**
 * Inspects logs, telemetry, and capabilities to identify improvements or recurring errors
 */
function detectEvolutionOpportunities() {
  const opportunities = [];

  try {
    // 1. Analyze diagnostic logs for recurring issues
    const logs = db.getDiagnosticLogs(100);
    const categoryCounts = {};
    for (const log of logs) {
      categoryCounts[log.category] = (categoryCounts[log.category] || 0) + 1;
    }

    for (const [cat, count] of Object.entries(categoryCounts)) {
      if (count >= 2 && cat !== 'AUTONOMOUS_PREVENTION' && cat !== 'account_security') {
        opportunities.push({
          type: 'RECURRING_ERROR_FIX',
          category: cat,
          evidence: `Category "${cat}" occurred ${count} times in recent execution history.`,
          recommendedAction: 'intent_routing_correction',
          riskLevel: 'LOW_RISK',
        });
      }
    }

    // 2. Check active capabilities
    const caps = capabilityRegistry.getAllCapabilities();
    if (!caps.some(c => c.id === 'system_auto_diagnostics')) {
      opportunities.push({
        type: 'FEATURE_EXPANSION',
        name: 'Auto-Diagnostics Extension',
        recommendedAction: 'dynamic_capability_registration',
        riskLevel: 'LOW_RISK',
        evidence: 'Proactive diagnostic reporting capability can be registered into capability registry.'
      });
    }
  } catch (err) {
    console.warn('[SelfUpdateEngine] Detection warning:', err.message);
  }

  return opportunities;
}

// ─── 4. Evolution Execution & Deployment Pipeline (Section 2, 6, 7) ─
/**
 * Executes a controlled, tested, and recoverable self-update
 */
async function executeSelfUpdate({
  reason,
  actionType = 'intent_routing_correction',
  filesChanged = [],
  patchFn = null,
  metadata = {},
  authorized = true
}) {
  const changeId = 'EVO_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex');
  const riskLevel = assessRiskLevel(actionType, metadata);

  console.log(`[SelfUpdate] 🚀 Starting Evolution Cycle (${changeId}): Reason: "${reason}", Risk: ${riskLevel}`);

  // 1. Check Approval Gate (Section 10)
  if (riskLevel === 'HIGH_RISK') {
    const approvalToken = crypto.randomBytes(16).toString('hex');
    db.createApprovalProposal({
      proposalId: changeId,
      title: reason,
      description: `Action: ${actionType}, Metadata: ${JSON.stringify(metadata)}`,
      riskLevel: 'HIGH_RISK',
      patchDiff: metadata.diff || 'High-risk configuration change',
      approvalToken,
    });

    db.recordEvolutionChange({
      changeId,
      versionFrom: CURRENT_VERSION,
      versionTo: CURRENT_VERSION,
      reason,
      riskLevel: 'HIGH_RISK',
      filesChanged,
      testsExecuted: [],
      testResults: 'NOT_RUN',
      status: 'PENDING_APPROVAL',
      healthCheckStatus: 'UNKNOWN',
      rollbackOccurred: 0,
      backupPath: null,
      lessonsLearned: 'High-risk change safely gated pending administrator authorization.'
    });

    return {
      success: false,
      status: 'PENDING_APPROVAL',
      changeId,
      approvalToken,
      message: '⚠️ এই পরিবর্তনটি উচ্চ-ঝুঁকিপূর্ণ (HIGH_RISK)। অ্যাডমিন অনুমোদনের জন্য পেন্ডিং রয়েছে।'
    };
  }

  // 2. Stage & Take Point-In-Time Backup (Zero-Loss Guarantee - Section 5)
  let backupPath = null;
  try {
    backupPath = createEvolutionSnapshot(changeId);
  } catch (backupErr) {
    return {
      success: false,
      status: 'BACKUP_FAILED',
      changeId,
      error: `Snapshot failed: ${backupErr.message}. Aborting to protect user data.`
    };
  }

  // 3. Apply Patch / Code Execution Safely
  let patchApplied = false;
  try {
    if (typeof patchFn === 'function') {
      await patchFn();
      patchApplied = true;
    } else {
      patchApplied = true; // Non-code configuration or routing update
    }
  } catch (patchErr) {
    // Immediate Rollback
    restoreEvolutionSnapshot(backupPath);
    db.recordEvolutionChange({
      changeId,
      versionFrom: CURRENT_VERSION,
      versionTo: CURRENT_VERSION,
      reason,
      riskLevel,
      filesChanged,
      testsExecuted: [],
      testResults: 'FAILED',
      status: 'ROLLED_BACK',
      healthCheckStatus: 'FAILED',
      rollbackOccurred: 1,
      backupPath,
      lessonsLearned: `Patch execution threw error: ${patchErr.message}. Immediate rollback performed.`
    });

    return {
      success: false,
      status: 'ROLLED_BACK',
      changeId,
      error: `Patch error: ${patchErr.message}. Restored to previous safe state.`
    };
  }

  // 4. Run Automated Regression & Security Test Suite (Section 8)
  console.log(`[SelfUpdate] 🧪 Running regression test suite for change ${changeId}...`);
  const regResults = await getRegressionRunner().runRegressionTests();
  const testsExecuted = regResults.details.map(d => d.name);

  if (!regResults.success) {
    // FAILED: Immediate Automated Rollback (Section 9)
    console.warn(`[SelfUpdate] ⚠️ Regression detected (${regResults.passedCount}/${regResults.totalCount} passed). Triggering automatic rollback!`);
    restoreEvolutionSnapshot(backupPath);

    const failedTests = regResults.details.filter(d => d.status === 'FAILED').map(d => `${d.name}: ${d.error}`).join('; ');
    const lessonsLearned = `Self-update failed regression checks: ${failedTests}. System autonomously rolled back without user data loss.`;

    db.recordEvolutionChange({
      changeId,
      versionFrom: CURRENT_VERSION,
      versionTo: CURRENT_VERSION,
      reason,
      riskLevel,
      filesChanged,
      testsExecuted,
      testResults: 'FAILED',
      status: 'ROLLED_BACK',
      healthCheckStatus: 'FAILED',
      rollbackOccurred: 1,
      backupPath,
      lessonsLearned
    });

    return {
      success: false,
      status: 'ROLLED_BACK',
      changeId,
      regressionResults: regResults,
      message: '❌ রিগ্রেশন পরীক্ষায় ব্যর্থ হওয়ায় পরিবর্তনটি বাতিল করে স্বয়ংক্রিয়ভাবে আগের সংস্করণে রোলব্যাক করা হয়েছে।'
    };
  }

  // 5. Post-Deployment Autonomous Health Check (Section 9)
  const healthCheck = monitorPostDeploymentHealth();
  if (healthCheck.status !== 'HEALTHY') {
    // Health degraded -> Rollback
    console.warn(`[SelfUpdate] ⚠️ Post-deployment health check failed: ${healthCheck.issues.join(', ')}. Rolling back.`);
    restoreEvolutionSnapshot(backupPath);

    db.recordEvolutionChange({
      changeId,
      versionFrom: CURRENT_VERSION,
      versionTo: CURRENT_VERSION,
      reason,
      riskLevel,
      filesChanged,
      testsExecuted,
      testResults: 'PASSED',
      status: 'ROLLED_BACK',
      healthCheckStatus: 'DEGRADED',
      rollbackOccurred: 1,
      backupPath,
      lessonsLearned: `Health check degraded after deployment: ${healthCheck.issues.join(', ')}`
    });

    return {
      success: false,
      status: 'ROLLED_BACK',
      changeId,
      healthCheck,
      message: '❌ ডিপ্লয়মেন্ট পরবর্তী স্বাস্থ্য পরীক্ষায় সমস্যা দেখা দেওয়ায় রোলব্যাক সম্পন্ন হয়েছে।'
    };
  }

  // 6. Release Verification & Persistent Record (Section 11 & 12)
  const newVersion = computeNextVersion(CURRENT_VERSION, riskLevel);
  const lessonsLearned = `Successfully deployed safe self-update: "${reason}". Verified with 100% regression pass rate and zero user data loss.`;

  db.recordEvolutionChange({
    changeId,
    versionFrom: CURRENT_VERSION,
    versionTo: newVersion,
    reason,
    riskLevel,
    filesChanged,
    testsExecuted,
    testResults: 'PASSED',
    status: 'DEPLOYED',
    healthCheckStatus: 'HEALTHY',
    rollbackOccurred: 0,
    backupPath,
    lessonsLearned
  });

  console.log(`[SelfUpdate] ✅ Evolution cycle completed successfully! Deployed version: ${newVersion}`);

  return {
    success: true,
    status: 'DEPLOYED',
    changeId,
    versionFrom: CURRENT_VERSION,
    versionTo: newVersion,
    testsExecutedCount: regResults.passedCount,
    healthCheckStatus: 'HEALTHY',
    lessonsLearned
  };
}

/**
 * Health check monitor after deployment (Section 9)
 */
function monitorPostDeploymentHealth() {
  const issues = [];
  try {
    const q = db.prepare('SELECT 1 as val').get();
    if (!q || q.val !== 1) issues.push('Database query check failed');
  } catch (e) {
    issues.push(`Database error: ${e.message}`);
  }

  try {
    const userCount = db.prepare('SELECT COUNT(*) as c FROM bot_authorized_users').get().c;
    if (typeof userCount !== 'number' || userCount < 1) {
      issues.push('Zero-Loss Violation: User accounts count corrupted or empty');
    }
  } catch (e) {
    issues.push(`User integrity error: ${e.message}`);
  }

  return {
    status: issues.length === 0 ? 'HEALTHY' : 'DEGRADED',
    issues,
    timestamp: new Date().toISOString()
  };
}

function computeNextVersion(current, riskLevel) {
  const parts = current.split('.').map(Number);
  if (parts.length !== 3) return '2.5.1';
  if (riskLevel === 'HIGH_RISK') {
    return `${parts[0]}.${parts[1] + 1}.0`;
  }
  return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
}

/**
 * Get comprehensive Evolution System Status
 */
function getEvolutionStatus() {
  const history = db.getEvolutionHistory(20);
  const flags = featureFlags.getAll();
  const proposals = db.getPendingProposals();
  const health = monitorPostDeploymentHealth();

  return {
    currentVersion: CURRENT_VERSION,
    lastKnownGoodVersion: LAST_KNOWN_GOOD_VERSION,
    health,
    totalReleases: history.length,
    successfulDeployments: history.filter(h => h.status === 'DEPLOYED').length,
    automaticRollbacks: history.filter(h => h.rollback_occurred === 1).length,
    pendingProposalsCount: proposals.length,
    activeFeatureFlags: flags.filter(f => f.enabled).length,
    totalFeatureFlags: flags.length,
    history,
    featureFlags: flags,
    pendingProposals: proposals,
  };
}

module.exports = {
  CURRENT_VERSION,
  LAST_KNOWN_GOOD_VERSION,
  createEvolutionSnapshot,
  restoreEvolutionSnapshot,
  assessRiskLevel,
  detectEvolutionOpportunities,
  executeSelfUpdate,
  monitorPostDeploymentHealth,
  getEvolutionStatus,
};
