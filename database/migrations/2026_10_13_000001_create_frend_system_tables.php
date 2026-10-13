<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // 1. Table: bot_authorized_users
        if (!Schema::hasTable('bot_authorized_users')) {
            Schema::create('bot_authorized_users', function (Blueprint $table) {
                $table->id();
                $table->string('username', 191)->unique();
                $table->string('password');
                $table->string('display_name', 191)->default('');
                $table->string('bound_phone', 100)->nullable()->index();
                $table->enum('status', ['active', 'disabled', 'blocked'])->default('active');
                $table->enum('role', ['admin', 'user'])->default('user');
                $table->string('assigned_plan_id', 50)->default('free');
                $table->timestamp('last_login_at')->nullable();
                $table->timestamps();
            });
        }

        // 2. Table: plans
        if (!Schema::hasTable('plans')) {
            Schema::create('plans', function (Blueprint $table) {
                $table->string('id', 50)->primary();
                $table->string('name', 100);
                $table->enum('status', ['active', 'inactive'])->default('active');
                $table->longText('entitlements')->comment('JSON array of allowed features');
                $table->longText('limits')->comment('JSON object of usage quotas');
                $table->timestamps();
            });
        }

        // 3. Table: notes
        if (!Schema::hasTable('notes')) {
            Schema::create('notes', function (Blueprint $table) {
                $table->id();
                $table->string('user_id', 191)->index();
                $table->longText('content');
                $table->string('tags', 255)->default('');
                $table->boolean('is_pinned')->default(false);
                $table->timestamps();
            });
        }

        // 4. Table: reminders
        if (!Schema::hasTable('reminders')) {
            Schema::create('reminders', function (Blueprint $table) {
                $table->id();
                $table->string('user_id', 191)->index();
                $table->text('content');
                $table->dateTime('remind_at')->index();
                $table->dateTime('scheduled_at')->nullable();
                $table->string('timezone', 50)->default('Asia/Dhaka');
                $table->enum('status', ['PENDING', 'SENT', 'CANCELLED', 'FAILED', 'SNOOZED'])->default('PENDING')->index();
                $table->dateTime('job_started_at')->nullable();
                $table->dateTime('notification_attempted_at')->nullable();
                $table->dateTime('notification_confirmed_at')->nullable();
                $table->string('delivery_channel', 50)->default('whatsapp');
                $table->unsignedInteger('retry_count')->default(0);
                $table->text('last_error')->nullable();
                $table->boolean('is_sent')->default(false)->index();
                $table->timestamps();
            });
        }

        // 5. Table: user_gamification
        if (!Schema::hasTable('user_gamification')) {
            Schema::create('user_gamification', function (Blueprint $table) {
                $table->string('user_id', 191)->primary();
                $table->unsignedInteger('points')->default(0);
                $table->unsignedInteger('level')->default(1);
                $table->unsignedInteger('streak_days')->default(0);
                $table->date('last_active_date')->nullable();
                $table->unsignedInteger('tasks_completed')->default(0);
                $table->timestamps();
            });
        }

        // 6. Table: user_badges
        if (!Schema::hasTable('user_badges')) {
            Schema::create('user_badges', function (Blueprint $table) {
                $table->id();
                $table->string('user_id', 191)->index();
                $table->string('badge_key', 100);
                $table->string('badge_name', 191);
                $table->text('badge_desc')->nullable();
                $table->timestamp('awarded_at')->useCurrent();
                $table->unique(['user_id', 'badge_key']);
            });
        }

        // 7. Table: memories
        if (!Schema::hasTable('memories')) {
            Schema::create('memories', function (Blueprint $table) {
                $table->id();
                $table->string('user_id', 191)->index();
                $table->string('memory_type', 50);
                $table->string('source_type', 50);
                $table->string('original_ref', 255)->nullable();
                $table->string('title', 255)->nullable();
                $table->longText('content');
                $table->longText('structured_data')->nullable();
                $table->string('topics', 255)->default('');
                $table->dateTime('event_date')->nullable();
                $table->decimal('confidence', 3, 2)->default(1.00);
                $table->boolean('is_active')->default(true);
                $table->timestamps();
            });
        }

        // 8. Table: location_reminders
        if (!Schema::hasTable('location_reminders')) {
            Schema::create('location_reminders', function (Blueprint $table) {
                $table->id();
                $table->string('user_id', 191)->index();
                $table->string('place_name', 191);
                $table->text('reminder_text');
                $table->decimal('lat', 10, 8)->nullable();
                $table->decimal('lng', 11, 8)->nullable();
                $table->integer('radius_meters')->default(300);
                $table->boolean('is_triggered')->default(false)->index();
                $table->timestamps();
            });
        }

        // 9. Table: offline_queue
        if (!Schema::hasTable('offline_queue')) {
            Schema::create('offline_queue', function (Blueprint $table) {
                $table->id();
                $table->string('user_id', 191)->index();
                $table->text('message');
                $table->boolean('sent')->default(false)->index();
                $table->timestamp('created_at')->useCurrent();
                $table->dateTime('sent_at')->nullable();
            });
        }

        // 10. Table: system_settings
        if (!Schema::hasTable('system_settings')) {
            Schema::create('system_settings', function (Blueprint $table) {
                $table->string('key', 100)->primary();
                $table->longText('value')->nullable();
                $table->string('description', 255)->nullable();
                $table->timestamp('updated_at')->useCurrent()->useCurrentOnUpdate();
            });
        }

        // 11. Table: user_audit_logs
        if (!Schema::hasTable('user_audit_logs')) {
            Schema::create('user_audit_logs', function (Blueprint $table) {
                $table->id();
                $table->string('actor_user_id', 191)->default('system');
                $table->string('target_user_id', 191)->default('system');
                $table->string('action', 100)->index();
                $table->string('result', 50);
                $table->longText('metadata')->nullable();
                $table->timestamp('created_at')->useCurrent()->index();
            });
        }

        // 12. Table: system_diagnostic_logs
        if (!Schema::hasTable('system_diagnostic_logs')) {
            Schema::create('system_diagnostic_logs', function (Blueprint $table) {
                $table->id();
                $table->string('error_id', 100)->unique();
                $table->string('user_id', 191)->nullable();
                $table->string('category', 100);
                $table->string('original_intent', 255)->nullable();
                $table->text('user_message')->nullable();
                $table->text('root_cause')->nullable();
                $table->text('corrective_action')->nullable();
                $table->text('test_results')->nullable();
                $table->string('status', 50);
                $table->longText('metadata')->nullable();
                $table->timestamp('created_at')->useCurrent();
            });
        }

        // Seed initial records if empty
        $this->seedInitialData();
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('system_diagnostic_logs');
        Schema::dropIfExists('user_audit_logs');
        Schema::dropIfExists('system_settings');
        Schema::dropIfExists('offline_queue');
        Schema::dropIfExists('location_reminders');
        Schema::dropIfExists('memories');
        Schema::dropIfExists('user_badges');
        Schema::dropIfExists('user_gamification');
        Schema::dropIfExists('reminders');
        Schema::dropIfExists('notes');
        Schema::dropIfExists('plans');
        Schema::dropIfExists('bot_authorized_users');
    }

    /**
     * Seed initial configuration and admin
     */
    protected function seedInitialData(): void
    {
        // Plans
        if (DB::table('plans')->count() === 0) {
            DB::table('plans')->insert([
                [
                    'id' => 'free',
                    'name' => 'ফ্রি প্ল্যান (Free)',
                    'status' => 'active',
                    'entitlements' => json_encode(['notes', 'reminders', 'basic_ai']),
                    'limits' => json_encode(['max_notes' => 50, 'max_reminders' => 25, 'voice' => false, 'vision' => false]),
                    'created_at' => now(),
                    'updated_at' => now(),
                ],
                [
                    'id' => 'pro',
                    'name' => 'প্রো প্ল্যান (Pro)',
                    'status' => 'active',
                    'entitlements' => json_encode(['notes', 'reminders', 'calendar', 'voice', 'vision', 'local_ai', 'unlimited_notes']),
                    'limits' => json_encode(['max_notes' => 1000, 'max_reminders' => 500, 'voice' => true, 'vision' => true]),
                    'created_at' => now(),
                    'updated_at' => now(),
                ],
                [
                    'id' => 'enterprise',
                    'name' => 'এন্টারপ্রাইজ (Enterprise)',
                    'status' => 'active',
                    'entitlements' => json_encode(['notes', 'reminders', 'calendar', 'voice', 'vision', 'local_ai', 'unlimited_notes', 'priority_support']),
                    'limits' => json_encode(['max_notes' => 10000, 'max_reminders' => 5000, 'voice' => true, 'vision' => true]),
                    'created_at' => now(),
                    'updated_at' => now(),
                ],
            ]);
        }

        // Initial Admin User (password: 123)
        if (DB::table('bot_authorized_users')->count() === 0) {
            DB::table('bot_authorized_users')->insert([
                'username' => 'admin',
                'password' => password_hash('123', PASSWORD_BCRYPT),
                'display_name' => 'প্রধান অ্যাডমিন',
                'bound_phone' => '8801969091751@c.us',
                'status' => 'active',
                'role' => 'admin',
                'assigned_plan_id' => 'enterprise',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        // Initial Settings
        if (DB::table('system_settings')->count() === 0) {
            DB::table('system_settings')->insert([
                ['key' => 'BOT_NAME', 'value' => 'FREND WhatsApp Assistant', 'description' => 'বটের নাম'],
                ['key' => 'FREND_BOT_URL', 'value' => 'https://railway.com', 'description' => 'Node.js WhatsApp Engine URL (Railway / Render / Local)'],
                ['key' => 'GEMINI_API_KEY', 'value' => '', 'description' => 'Google AI Studio Gemini API Key'],
                ['key' => 'TIMEZONE', 'value' => 'Asia/Dhaka', 'description' => 'ডিফল্ট টাইমজোন'],
                ['key' => 'OWNER_PHONE', 'value' => '8801969091751', 'description' => 'বট ওনারের WhatsApp নম্বর'],
            ]);
        }
    }
};
