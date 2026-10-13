<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class OutgoingContactTask extends Model
{
    protected $table = 'outgoing_contact_tasks';

    protected $fillable = [
        'user_id',
        'recipient_phone',
        'recipient_name',
        'task_type',
        'message_body',
        'status',
        'response_log',
    ];
}
