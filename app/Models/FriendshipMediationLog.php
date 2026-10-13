<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FriendshipMediationLog extends Model
{
    protected $table = 'friendship_mediation_logs';
    public $timestamps = false;

    protected $fillable = [
        'mediation_id',
        'stage',
        'sender_phone',
        'sender_role',
        'message_body',
        'created_at',
    ];

    protected $casts = [
        'created_at' => 'datetime',
    ];

    public function mediation(): BelongsTo
    {
        return $this->belongsTo(FriendshipMediation::class, 'mediation_id');
    }
}
