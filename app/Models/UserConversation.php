<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class UserConversation extends Model
{
    protected $table = 'user_conversations';
    public $timestamps = false;

    protected $fillable = [
        'user_id',
        'role',
        'message',
        'emotion',
        'created_at',
    ];

    protected $casts = [
        'created_at' => 'datetime',
    ];
}
