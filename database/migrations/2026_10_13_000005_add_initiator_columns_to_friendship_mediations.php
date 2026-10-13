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
        if (Schema::hasTable('friendship_mediations')) {
            Schema::table('friendship_mediations', function (Blueprint $table) {
                if (!Schema::hasColumn('friendship_mediations', 'initiator_phone')) {
                    $table->string('initiator_phone', 100)->nullable()->index()->after('status');
                }
                if (!Schema::hasColumn('friendship_mediations', 'initiator_name')) {
                    $table->string('initiator_name', 100)->nullable()->after('initiator_phone');
                }
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasTable('friendship_mediations')) {
            Schema::table('friendship_mediations', function (Blueprint $table) {
                if (Schema::hasColumn('friendship_mediations', 'initiator_phone')) {
                    $table->dropColumn('initiator_phone');
                }
                if (Schema::hasColumn('friendship_mediations', 'initiator_name')) {
                    $table->dropColumn('initiator_name');
                }
            });
        }
    }
};
