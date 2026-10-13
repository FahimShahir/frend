<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MediationCase extends Model
{
    protected $table = 'mediation_cases';

    protected $fillable = [
        'case_code',
        'initiator_user_id',
        'target_phone',
        'target_name',
        'conflict_reason',
        'status',
        'group_invite_link',
        'mediation_notes',
        'last_message_at',
    ];

    protected $casts = [
        'last_message_at' => 'datetime',
    ];
}
