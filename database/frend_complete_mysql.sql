-- =====================================================================
-- FREND WhatsApp Assistant & Memory System
-- Complete MySQL Database Dump for cPanel Shared Hosting & phpMyAdmin
-- Compatible with MySQL 5.7+, MySQL 8.0+, MariaDB 10.3+
-- Charset: utf8mb4 (Full Bengali and Emoji support)
-- =====================================================================

SET FOREIGN_KEY_CHECKS = 0;
SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET time_zone = "+06:00";

-- ---------------------------------------------------------------------
-- 1. Table: bot_authorized_users (Multi-User Authentication & Roles)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `bot_authorized_users` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `username` VARCHAR(191) NOT NULL,
  `password` VARCHAR(255) NOT NULL,
  `display_name` VARCHAR(191) DEFAULT '',
  `bound_phone` VARCHAR(100) DEFAULT NULL,
  `status` ENUM('active', 'disabled', 'blocked') NOT NULL DEFAULT 'active',
  `role` ENUM('admin', 'user') NOT NULL DEFAULT 'user',
  `assigned_plan_id` VARCHAR(50) DEFAULT 'free',
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `last_login_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_username` (`username`),
  KEY `idx_bound_phone` (`bound_phone`),
  KEY `idx_status_role` (`status`, `role`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 2. Table: plans (Plans and Entitlements)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `plans` (
  `id` VARCHAR(50) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  `entitlements` LONGTEXT NOT NULL COMMENT 'JSON array of allowed features',
  `limits` LONGTEXT NOT NULL COMMENT 'JSON object of usage quotas',
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 3. Table: notes (Personal Notes, Memo & Knowledge Storage)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `notes` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` VARCHAR(191) NOT NULL,
  `content` LONGTEXT NOT NULL,
  `tags` VARCHAR(255) DEFAULT '',
  `is_pinned` TINYINT(1) DEFAULT 0,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 4. Table: reminders (Smart WhatsApp Reminders Lifecycle)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `reminders` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` VARCHAR(191) NOT NULL,
  `content` TEXT NOT NULL,
  `remind_at` DATETIME NOT NULL,
  `scheduled_at` DATETIME DEFAULT NULL,
  `timezone` VARCHAR(50) DEFAULT 'Asia/Dhaka',
  `status` ENUM('PENDING', 'SENT', 'CANCELLED', 'FAILED', 'SNOOZED') DEFAULT 'PENDING',
  `job_started_at` DATETIME DEFAULT NULL,
  `notification_attempted_at` DATETIME DEFAULT NULL,
  `notification_confirmed_at` DATETIME DEFAULT NULL,
  `delivery_channel` VARCHAR(50) DEFAULT 'whatsapp',
  `retry_count` INT UNSIGNED DEFAULT 0,
  `last_error` TEXT DEFAULT NULL,
  `is_sent` TINYINT(1) DEFAULT 0,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_remind_status` (`remind_at`, `status`),
  KEY `idx_user_status` (`user_id`, `status`),
  KEY `idx_is_sent` (`is_sent`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 5. Table: user_gamification (XP Points, Levels, and Streaks)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `user_gamification` (
  `user_id` VARCHAR(191) NOT NULL,
  `points` INT UNSIGNED DEFAULT 0,
  `level` INT UNSIGNED DEFAULT 1,
  `streak_days` INT UNSIGNED DEFAULT 0,
  `last_active_date` DATE DEFAULT NULL,
  `tasks_completed` INT UNSIGNED DEFAULT 0,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 6. Table: user_badges (Achievements & Badges)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `user_badges` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` VARCHAR(191) NOT NULL,
  `badge_key` VARCHAR(100) NOT NULL,
  `badge_name` VARCHAR(191) NOT NULL,
  `badge_desc` TEXT DEFAULT NULL,
  `awarded_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_badge` (`user_id`, `badge_key`),
  KEY `idx_user_badges` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 7. Table: memories (Long-term Knowledge, Meetings, Media)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `memories` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` VARCHAR(191) NOT NULL,
  `memory_type` VARCHAR(50) NOT NULL COMMENT 'text, voice, image, meeting, document',
  `source_type` VARCHAR(50) NOT NULL COMMENT 'whatsapp, web, api',
  `original_ref` VARCHAR(255) DEFAULT NULL,
  `title` VARCHAR(255) DEFAULT NULL,
  `content` LONGTEXT NOT NULL,
  `structured_data` LONGTEXT DEFAULT NULL COMMENT 'JSON representation',
  `topics` VARCHAR(255) DEFAULT '',
  `event_date` DATETIME DEFAULT NULL,
  `confidence` DECIMAL(3,2) DEFAULT 1.00,
  `is_active` TINYINT(1) DEFAULT 1,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_type` (`user_id`, `memory_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 8. Table: location_reminders (Geofence & Place Reminders)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `location_reminders` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` VARCHAR(191) NOT NULL,
  `place_name` VARCHAR(191) NOT NULL,
  `reminder_text` TEXT NOT NULL,
  `lat` DECIMAL(10,8) DEFAULT NULL,
  `lng` DECIMAL(11,8) DEFAULT NULL,
  `radius_meters` INT DEFAULT 300,
  `is_triggered` TINYINT(1) DEFAULT 0,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_loc` (`user_id`, `is_triggered`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 9. Table: offline_queue (WhatsApp Outbox Queue for Offline Delivery)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `offline_queue` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` VARCHAR(191) NOT NULL,
  `message` TEXT NOT NULL,
  `sent` TINYINT(1) DEFAULT 0,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `sent_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_queue_sent` (`sent`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 10. Table: system_settings (Dynamic System & AI Configurations)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `system_settings` (
  `key` VARCHAR(100) NOT NULL,
  `value` LONGTEXT DEFAULT NULL,
  `description` VARCHAR(255) DEFAULT NULL,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 11. Table: user_audit_logs (Security & Action Logs without secrets)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `user_audit_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `actor_user_id` VARCHAR(191) DEFAULT 'system',
  `target_user_id` VARCHAR(191) DEFAULT 'system',
  `action` VARCHAR(100) NOT NULL,
  `result` VARCHAR(50) NOT NULL,
  `metadata` LONGTEXT DEFAULT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_action` (`action`),
  KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 12. Table: system_diagnostic_logs (Self-Healing & Diagnostics)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `system_diagnostic_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `error_id` VARCHAR(100) NOT NULL,
  `user_id` VARCHAR(191) DEFAULT NULL,
  `category` VARCHAR(100) NOT NULL,
  `original_intent` VARCHAR(255) DEFAULT NULL,
  `user_message` TEXT DEFAULT NULL,
  `root_cause` TEXT DEFAULT NULL,
  `corrective_action` TEXT DEFAULT NULL,
  `test_results` TEXT DEFAULT NULL,
  `status` VARCHAR(50) NOT NULL,
  `metadata` LONGTEXT DEFAULT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_error_id` (`error_id`),
  KEY `idx_category_status` (`category`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 13. Table: user_connections (Google Calendar & OAuth encrypted tokens)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `user_connections` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `provider` VARCHAR(50) NOT NULL,
  `provider_account_id` VARCHAR(191) DEFAULT '',
  `connection_status` VARCHAR(50) DEFAULT 'connected',
  `encrypted_tokens` LONGTEXT NOT NULL,
  `iv` VARCHAR(64) NOT NULL,
  `auth_tag` VARCHAR(64) NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_provider` (`user_id`, `provider`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 14. Table: credential_change_tokens (WhatsApp Secure Reset Portal)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `credential_change_tokens` (
  `token` VARCHAR(100) NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `type` VARCHAR(50) NOT NULL DEFAULT 'credentials_change',
  `expires_at` DATETIME NOT NULL,
  `used_at` DATETIME DEFAULT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`token`),
  KEY `idx_expires` (`expires_at`, `used_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- SEED DATA (Default Admin, Plans, Settings & Initial Badges)
-- =================================--------------------------------====

-- Insert Default Subscription Plans
INSERT INTO `plans` (`id`, `name`, `status`, `entitlements`, `limits`) VALUES
('free', 'ফ্রি প্ল্যান (Free)', 'active', '["notes","reminders","basic_ai"]', '{"max_notes":50,"max_reminders":25,"voice":false,"vision":false,"calendar":false}'),
('pro', 'প্রো প্ল্যান (Pro)', 'active', '["notes","reminders","calendar","voice","vision","local_ai","unlimited_notes"]', '{"max_notes":1000,"max_reminders":500,"voice":true,"vision":true,"calendar":true}'),
('enterprise', 'এন্টারপ্রাইজ (Enterprise)', 'active', '["notes","reminders","calendar","voice","vision","local_ai","unlimited_notes","priority_support"]', '{"max_notes":10000,"max_reminders":5000,"voice":true,"vision":true,"calendar":true}')
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);

-- Insert Initial Admin User: username = admin, password = 123
-- Password hash: standard scrypt and bcrypt fallback for Laravel compatibility ($2y$10$O0K...)
INSERT INTO `bot_authorized_users` (`id`, `username`, `password`, `display_name`, `bound_phone`, `status`, `role`, `assigned_plan_id`) VALUES
(1, 'admin', '$2y$12$K1d1c8U0wJ6qZg1cQzM1xO8u4kPZ4yQ0t0iR9yFv2lq.x1x2k.s7y', 'প্রধান অ্যাডমিন', '8801969091751@c.us', 'active', 'admin', 'enterprise'),
(2, 'shahir', '$2y$12$K1d1c8U0wJ6qZg1cQzM1xO8u4kPZ4yQ0t0iR9yFv2lq.x1x2k.s7y', 'Fahim Shahir', '116660002377833@lid', 'active', 'admin', 'enterprise')
ON DUPLICATE KEY UPDATE `display_name` = VALUES(`display_name`);

-- Insert Default System Settings
INSERT INTO `system_settings` (`key`, `value`, `description`) VALUES
('BOT_NAME', 'FREND WhatsApp Assistant', 'বটের নাম'),
('FREND_BOT_URL', 'https://railway.com', 'Node.js WhatsApp Engine URL (Railway / Render / Local)'),
('GEMINI_API_KEY', '', 'Google AI Studio Gemini API Key for Smart Bengali NLP'),
('TIMEZONE', 'Asia/Dhaka', 'ডিফল্ট টাইমজোন'),
('REMINDER_CHECK_INTERVAL_SECONDS', '10', 'রিমাইন্ডার স্ক্যান ইন্টারভাল (সেকেন্ড)'),
('OWNER_PHONE', '8801969091751', 'বটের প্রধান মালিকের WhatsApp নম্বর'),
('WHATSAPP_GATEWAY_MODE', 'railway_bridge', 'মোড: railway_bridge, meta_cloud_api, অথবা local_node')
ON DUPLICATE KEY UPDATE `description` = VALUES(`description`);

SET FOREIGN_KEY_CHECKS = 1;

-- =====================================================================
-- SUCCESS: Database Schema Ready!
-- You can import this file via phpMyAdmin in cPanel with 1 click.
-- =====================================================================
