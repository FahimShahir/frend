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
        if (!Schema::hasTable('friendship_mediations')) {
            Schema::create('friendship_mediations', function (Blueprint $table) {
                $table->id();
                $table->string('case_code', 50)->unique()->index();
                $table->string('status', 60)->default('STEP_1_LISTENING_PARTY_A')->index();

                // Party A (Initiator)
                $table->string('party_a_id', 100)->index();
                $table->string('party_a_phone', 50)->index();
                $table->string('party_a_name', 100)->default('বন্ধু ১');
                $table->longText('party_a_statement')->nullable()->comment('Party A feelings, complaints, expectations');
                $table->boolean('party_a_consent_contact')->default(false)->comment('Consent to reach out to Party B');
                $table->boolean('party_a_consent_group')->default(false)->comment('Consent to join WhatsApp group');

                // Party B (Friend)
                $table->string('party_b_phone', 50)->nullable()->index();
                $table->string('party_b_name', 100)->nullable()->default('বন্ধু ২');
                $table->longText('party_b_statement')->nullable()->comment('Party B feelings & perspective');
                $table->boolean('party_b_consent_chat')->default(false)->comment('Party B agreed to share their perspective');
                $table->boolean('party_b_consent_group')->default(false)->comment('Party B agreed to join mediation group');

                // Neutral AI Analysis
                $table->longText('analysis_summary')->nullable()->comment('Neutral analysis of root causes and misunderstandings');

                // Group & Mediation Attempt Tracking (Max 2 Attempts)
                $table->string('group_id', 100)->nullable()->index()->comment('WhatsApp Group JID: @g.us');
                $table->string('group_invite_link', 255)->nullable();
                $table->unsignedTinyInteger('attempts_count')->default(0)->comment('Max 2 attempts');
                $table->string('first_leaver_phone', 50)->nullable();
                $table->string('second_leaver_phone', 50)->nullable();

                // Outcome & Closure
                $table->boolean('is_terminated')->default(false)->index();
                $table->string('closure_reason', 100)->nullable();
                $table->longText('reconciliation_outcome')->nullable();
                $table->timestamp('last_interaction_at')->nullable();
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('friendship_mediation_logs')) {
            Schema::create('friendship_mediation_logs', function (Blueprint $table) {
                $table->id();
                $table->foreignId('mediation_id')->constrained('friendship_mediations')->onDelete('cascade');
                $table->string('stage', 60);
                $table->string('sender_phone', 50)->nullable();
                $table->string('sender_role', 30); // party_a, party_b, ai_mediator, system
                $table->longText('message_body');
                $table->timestamp('created_at')->useCurrent();
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('friendship_mediation_logs');
        Schema::dropIfExists('friendship_mediations');
    }
};
