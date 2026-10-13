<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;

/**
 * @property int $id
 * @property string $username
 * @property string $password
 * @property string $display_name
 * @property string|null $bound_phone
 * @property string $status
 * @property string $role
 * @property string $assigned_plan_id
 * @property \Carbon\Carbon|null $last_login_at
 * @property \Carbon\Carbon|null $created_at
 * @property \Carbon\Carbon|null $updated_at
 * @method static \Illuminate\Database\Eloquent\Builder|BotUser where($column, $operator = null, $value = null)
 * @method static \Illuminate\Database\Eloquent\Builder|BotUser query()
 * @method static BotUser|null find($id)
 */
class BotUser extends Model
{
    use HasFactory;

    protected $table = 'bot_authorized_users';

    protected $fillable = [
        'username',
        'password',
        'display_name',
        'bound_phone',
        'status',
        'role',
        'assigned_plan_id',
        'last_login_at',
    ];

    protected $hidden = [
        'password',
    ];

    protected $casts = [
        'last_login_at' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    public function plan()
    {
        return $this->belongsTo(Plan::class, 'assigned_plan_id', 'id');
    }

    public function gamification()
    {
        return $this->hasOne(Gamification::class, 'user_id', 'bound_phone');
    }

    public function notes()
    {
        return $this->hasMany(Note::class, 'user_id', 'bound_phone');
    }

    public function reminders()
    {
        return $this->hasMany(Reminder::class, 'user_id', 'bound_phone');
    }

    public function isAdmin(): bool
    {
        return $this->role === 'admin';
    }

    public function isActive(): bool
    {
        return $this->status === 'active';
    }
}
