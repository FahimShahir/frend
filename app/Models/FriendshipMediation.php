<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class FriendshipMediation extends Model
{
    protected $table = 'friendship_mediations';

    protected $fillable = [
        'case_code',
        'status',
        'party_a_id',
        'party_a_phone',
        'party_a_name',
        'party_a_statement',
        'party_a_consent_contact',
        'party_a_consent_group',
        'party_b_phone',
        'party_b_name',
        'party_b_statement',
        'party_b_consent_chat',
        'party_b_consent_group',
        'analysis_summary',
        'group_id',
        'group_invite_link',
        'attempts_count',
        'first_leaver_phone',
        'second_leaver_phone',
        'is_terminated',
        'closure_reason',
        'reconciliation_outcome',
        'last_interaction_at',
    ];

    protected $casts = [
        'party_a_consent_contact' => 'boolean',
        'party_a_consent_group' => 'boolean',
        'party_b_consent_chat' => 'boolean',
        'party_b_consent_group' => 'boolean',
        'is_terminated' => 'boolean',
        'attempts_count' => 'integer',
        'last_interaction_at' => 'datetime',
    ];

    public function logs(): HasMany
    {
        return $this->hasMany(FriendshipMediationLog::class, 'mediation_id');
    }

    /**
     * Finds active mediation for either Party A or Party B or a Group
     */
    public static function findActiveMediationFor(string $phoneOrGroup): ?self
    {
        $cleanPhone = preg_replace('/\D/', '', $phoneOrGroup);

        return self::where('is_terminated', false)
            ->where(function ($q) use ($phoneOrGroup, $cleanPhone) {
                if (str_ends_with($phoneOrGroup, '@g.us')) {
                    $q->where('group_id', $phoneOrGroup);
                } else {
                    $q->where('party_a_phone', $phoneOrGroup)
                      ->orWhere('party_a_phone', 'LIKE', "%{$cleanPhone}%")
                      ->orWhere('party_b_phone', $phoneOrGroup)
                      ->orWhere('party_b_phone', 'LIKE', "%{$cleanPhone}%");
                }
            })
            ->latest()
            ->first();
    }
}
