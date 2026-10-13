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
        // 1. Dynamic Extensible Features & Capabilities
        if (!Schema::hasTable('system_dynamic_features')) {
            Schema::create('system_dynamic_features', function (Blueprint $table) {
                $table->id();
                $table->string('feature_key', 100)->unique();
                $table->string('name', 191);
                $table->text('description')->nullable();
                $table->longText('trigger_patterns')->comment('JSON array of regex or keywords');
                $table->longText('response_template');
                $table->string('action_type', 50)->default('reply'); // reply, webhook, function
                $table->boolean('is_active')->default(true)->index();
                $table->unsignedBigInteger('usage_count')->default(0);
                $table->timestamps();
            });
        }

        // 2. Aggressive Local Offline Semantic AI & Intent Cache
        if (!Schema::hasTable('local_ai_knowledge_cache')) {
            Schema::create('local_ai_knowledge_cache', function (Blueprint $table) {
                $table->id();
                $table->string('query_hash', 64)->unique();
                $table->string('normalized_pattern', 255)->index();
                $table->string('intent_category', 100)->default('general')->index();
                $table->longText('cached_response');
                $table->unsignedBigInteger('hit_count')->default(1);
                $table->timestamp('last_hit_at')->useCurrent();
                $table->timestamps();
            });
        }

        // 3. Autonomous Self-Update Audit Trail
        if (!Schema::hasTable('system_self_updates')) {
            Schema::create('system_self_updates', function (Blueprint $table) {
                $table->id();
                $table->string('version', 50);
                $table->string('update_type', 50)->default('api'); // api, git, hotpatch, manual
                $table->string('status', 50)->default('success'); // success, failed, rolled_back
                $table->longText('change_log')->nullable();
                $table->longText('diagnostic_summary')->nullable();
                $table->timestamp('created_at')->useCurrent();
            });
        }

        // Seed default dynamic features if empty
        if (DB::table('system_dynamic_features')->count() === 0) {
            DB::table('system_dynamic_features')->insert([
                [
                    'feature_key' => 'bot_status_check',
                    'name' => 'সিস্টেম স্ট্যাটাস ও সেলফ-হিলিং পরীক্ষা',
                    'description' => 'বটের স্বাস্থ্য ও স্বয়ংক্রিয় সেলফ-হিলিং অবস্থা প্রদর্শন করে',
                    'trigger_patterns' => json_encode(['/^(?:status|স্ট্যাটাস|system\s*check|হেলথ|health)$/iu', '/^(?:self\s*heal|সেলফ\s*হিলিং|হিলিং|heal)$/iu']),
                    'response_template' => "🩺 *FREND সেলফ-হিলিং ও সিস্টেম রিপোর্ট:*\n\n✅ কোর ইঞ্জিন: সক্রিয় ও সুস্থ\n💾 লোকাল অফলাইন AI: সক্রিয় (লাইভ API প্রেশার হ্রাসকৃত)\n🛡️ ডেটাবেস: সম্পূর্ণ সংযুক্ত\n⚡ স্বয়ংক্রিয় মেরামত: চালু রয়েছে",
                    'action_type' => 'reply',
                    'is_active' => true,
                    'usage_count' => 0,
                    'created_at' => now(),
                    'updated_at' => now(),
                ],
                [
                    'feature_key' => 'creator_info',
                    'name' => 'অ্যাসিস্ট্যান্ট ও ক্রিয়েটর পরিচয়',
                    'description' => 'বটের নাম ও পরিচয় প্রদান করে',
                    'trigger_patterns' => json_encode(['/^(?:কে\s*বানিয়েছে|tumi\s*ke|তুমি\s*কে|who\s*are\s*you|তোমার\s*নাম\s*কী|tomar\s*nam\s*ki)$/iu']),
                    'response_template' => "🤖 আমি *FREND* — আপনার সার্বক্ষণিক স্মার্ট অ্যাসিস্ট্যান্ট!\n\nআমাকে তৈরি করা হয়েছে আপনার গুরুত্বপূর্ণ নোট, রিমাইন্ডার এবং ব্যক্তিগত কাজ স্বয়ংক্রিয়ভাবে মনে করিয়ে দেওয়ার জন্য।",
                    'action_type' => 'reply',
                    'is_active' => true,
                    'usage_count' => 0,
                    'created_at' => now(),
                    'updated_at' => now(),
                ],
                [
                    'feature_key' => 'time_and_date',
                    'name' => 'বর্তমান সময় ও তারিখ',
                    'description' => 'লোকাল টাইমজোন অনুযায়ী সঠিক সময় ও তারিখ জানায় (API খরচ শূন্য)',
                    'trigger_patterns' => json_encode(['/^(?:কয়টা\s*বাজে|সময়\s*কত|somoy\s*koto|koyta\s*baje|time|তারিখ|date)$/iu']),
                    'response_template' => "🕒 বর্তমান সময়: {TIME}\n📅 আজকের তারিখ: {DATE} (বাংলাদেশ সময়)",
                    'action_type' => 'reply',
                    'is_active' => true,
                    'usage_count' => 0,
                    'created_at' => now(),
                    'updated_at' => now(),
                ],
            ]);
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('system_self_updates');
        Schema::dropIfExists('local_ai_knowledge_cache');
        Schema::dropIfExists('system_dynamic_features');
    }
};
