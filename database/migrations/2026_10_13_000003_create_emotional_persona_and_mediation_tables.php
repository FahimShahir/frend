<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // 1. User Emotional & Personality Profile Table
        if (!Schema::hasTable('user_emotional_profiles')) {
            Schema::create('user_emotional_profiles', function (Blueprint $table) {
                $table->id();
                $table->string('user_id', 100)->unique()->index();
                $table->longText('personality_traits')->nullable()->comment('JSON: temperament, values, communication style');
                $table->integer('relationship_bond_level')->default(20)->comment('1-100 Bond closeness score');
                $table->string('current_mood', 50)->default('neutral')->comment('happy, romantic, pouty, angry, sad, stressed, caring');
                $table->string('intimacy_nickname', 100)->default('বন্ধু');
                $table->longText('known_contacts')->nullable()->comment('JSON: name => phone mappings');
                $table->longText('past_problems_summary')->nullable()->comment('Summary of past issues, solutions, and personality learnings');
                $table->unsignedBigInteger('total_conversations_count')->default(0);
                $table->timestamp('last_interaction_at')->nullable();
                $table->timestamps();
            });
        }

        // 2. User Conversation Memory & Emotion Context
        if (!Schema::hasTable('user_conversations')) {
            Schema::create('user_conversations', function (Blueprint $table) {
                $table->id();
                $table->string('user_id', 100)->index();
                $table->string('role', 20)->default('user'); // user, assistant
                $table->longText('message');
                $table->string('emotion', 50)->nullable()->comment('romantic, happy, angry, sad, caring, apologetic, problem');
                $table->timestamp('created_at')->useCurrent()->index();
            });
        }

        // 3. Outgoing Contact & Notification Tasks (Sending messages to others on behalf of user)
        if (!Schema::hasTable('outgoing_contact_tasks')) {
            Schema::create('outgoing_contact_tasks', function (Blueprint $table) {
                $table->id();
                $table->string('user_id', 100)->index();
                $table->string('recipient_phone', 50)->index();
                $table->string('recipient_name', 100)->nullable();
                $table->string('task_type', 50)->default('send_message'); // send_message, call_alert, peacemaker
                $table->text('message_body');
                $table->string('status', 50)->default('PENDING'); // PENDING, SENT, FAILED
                $table->text('response_log')->nullable();
                $table->timestamps();
            });
        }

        // 4. Mediation & Conflict Resolution Cases (ঝামেলা মিটমাট ও সমঝোতা)
        if (!Schema::hasTable('mediation_cases')) {
            Schema::create('mediation_cases', function (Blueprint $table) {
                $table->id();
                $table->string('case_code', 50)->unique();
                $table->string('initiator_user_id', 100)->index();
                $table->string('target_phone', 50)->index();
                $table->string('target_name', 100)->nullable();
                $table->text('conflict_reason')->nullable();
                $table->string('status', 50)->default('OPEN'); // OPEN, IN_PROGRESS, RESOLVED, CANCELLED
                $table->string('group_invite_link', 255)->nullable();
                $table->longText('mediation_notes')->nullable();
                $table->timestamp('last_message_at')->nullable();
                $table->timestamps();
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('mediation_cases');
        Schema::dropIfExists('outgoing_contact_tasks');
        Schema::dropIfExists('user_conversations');
        Schema::dropIfExists('user_emotional_profiles');
    }
};
