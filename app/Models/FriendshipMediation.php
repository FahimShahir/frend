<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property int $id
 * @property string $case_code
 * @property string $status
 * @property string $party_a_id
 * @property string $party_a_phone
 * @property string $party_a_name
 * @property string|null $party_a_statement
 * @property bool $party_a_consent_contact
 * @property bool $party_a_consent_group
 * @property string|null $party_b_phone
 * @property string|null $party_b_name
 * @property string|null $party_b_statement
 * @property bool $party_b_consent_chat
 * @property bool $party_b_consent_group
 * @property string|null $analysis_summary
 * @property string|null $group_id
 * @property string|null $group_invite_link
 * @property int $attempts_count
 * @property string|null $first_leaver_phone
 * @property string|null $second_leaver_phone
 * @property bool $is_terminated
 * @property string|null $closure_reason
 * @property string|null $reconciliation_outcome
 * @property \Carbon\Carbon|null $last_interaction_at
 * 
 * @method static FriendshipMediation create(array $attributes = [])
 */
class FriendshipMediation extends Model
{
    protected $table = 'friendship_mediations';

    protected $fillable = [
        'case_code',
        'status',
        'initiator_phone',
        'initiator_name',
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
                      ->orWhere('party_b_phone', $phoneOrGroup)
                      ->orWhere('party_a_id', $phoneOrGroup);

                    if (strlen($cleanPhone) >= 9) {
                        $tail9 = substr($cleanPhone, -9);
                        $q->orWhere('party_a_phone', 'LIKE', "%{$tail9}%")
                          ->orWhere('party_b_phone', 'LIKE', "%{$tail9}%")
                          ->orWhere('party_a_id', 'LIKE', "%{$tail9}%");
                    }
                }
            })
            ->latest()
            ->first();
    }

    /**
     * Finds all active mediations where the user is Party A, Party B, Initiator, or in a group
     */
    public static function findAllActiveCasesForSender(string $senderPhone, ?string $groupId = null)
    {
        $cleanPhone = preg_replace('/\D/', '', $senderPhone);

        return self::where('is_terminated', false)
            ->where(function ($q) use ($senderPhone, $cleanPhone, $groupId) {
                if ($groupId && str_ends_with($groupId, '@g.us')) {
                    $q->where('group_id', $groupId);
                }
                $q->orWhere('party_a_phone', $senderPhone)
                  ->orWhere('party_b_phone', $senderPhone)
                  ->orWhere('party_a_id', $senderPhone)
                  ->orWhere('initiator_phone', $senderPhone);

                if (strlen($cleanPhone) >= 9) {
                    $tail9 = substr($cleanPhone, -9);
                    $q->orWhere('party_a_phone', 'LIKE', "%{$tail9}%")
                      ->orWhere('party_b_phone', 'LIKE', "%{$tail9}%")
                      ->orWhere('party_a_id', 'LIKE', "%{$tail9}%")
                      ->orWhere('initiator_phone', 'LIKE', "%{$tail9}%");
                }
            })
            ->get();
    }

    /**
     * Finds latest terminated mediation for either Party A or Party B
     */
    public static function findLatestTerminatedMediationFor(string $phone): ?self
    {
        $cleanPhone = preg_replace('/\D/', '', $phone);

        return self::where('is_terminated', true)
            ->where(function ($q) use ($phone, $cleanPhone) {
                $q->where('party_a_phone', $phone)
                  ->orWhere('party_b_phone', $phone);

                if (strlen($cleanPhone) >= 9) {
                    $q->orWhere('party_a_phone', 'LIKE', "%{$cleanPhone}%")
                      ->orWhere('party_b_phone', 'LIKE', "%{$cleanPhone}%");
                }
            })
            ->latest()
            ->first();
    }
}
