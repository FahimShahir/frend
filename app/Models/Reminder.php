<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Carbon\Carbon;

/**
 * @property int $id
 * @property string $user_id
 * @property string $content
 * @property \Carbon\Carbon $remind_at
 * @property \Carbon\Carbon|null $scheduled_at
 * @property string $timezone
 * @property string $status
 * @property \Carbon\Carbon|null $job_started_at
 * @property \Carbon\Carbon|null $notification_attempted_at
 * @property \Carbon\Carbon|null $notification_confirmed_at
 * @property string $delivery_channel
 * @property int $retry_count
 * @property string|null $last_error
 * @property bool $is_sent
 * @property \Carbon\Carbon|null $created_at
 * @property \Carbon\Carbon|null $updated_at
 * @method static Builder|Reminder query()
 * @method static Builder|Reminder where($column, $operator = null, $value = null)
 * @method static Builder|Reminder latest($column = null)
 * @method static Builder|Reminder pending()
 * @method static Builder|Reminder due()
 * @method static Reminder create(array $attributes = [])
 * @method static Reminder findOrFail($id)
 */
class Reminder extends Model
{
    use HasFactory;

    protected $table = 'reminders';

    protected $fillable = [
        'user_id',
        'content',
        'remind_at',
        'scheduled_at',
        'timezone',
        'status',
        'job_started_at',
        'notification_attempted_at',
        'notification_confirmed_at',
        'delivery_channel',
        'retry_count',
        'last_error',
        'is_sent',
    ];

    protected $casts = [
        'remind_at' => 'datetime',
        'scheduled_at' => 'datetime',
        'job_started_at' => 'datetime',
        'notification_attempted_at' => 'datetime',
        'notification_confirmed_at' => 'datetime',
        'retry_count' => 'integer',
        'is_sent' => 'boolean',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    /**
     * Scope: Pending reminders
     */
    public function scopePending(Builder $query)
    {
        return $query->where('status', 'PENDING')->where('is_sent', false);
    }

    /**
     * Scope: Reminders that are due to be delivered right now
     */
    public function scopeDue(Builder $query)
    {
        return $query->pending()
            ->where('remind_at', '<=', now('Asia/Dhaka'));
    }

    /**
     * Scope: For specific user
     */
    public function scopeForUser(Builder $query, string $userId)
    {
        return $query->where('user_id', $userId);
    }

    /**
     * Mark as successfully sent
     */
    public function markSent(): bool
    {
        return $this->update([
            'status' => 'SENT',
            'is_sent' => true,
            'notification_confirmed_at' => now(),
            'last_error' => null,
        ]);
    }

    /**
     * Mark as failed with error log
     */
    public function markFailed(string $error): bool
    {
        return $this->update([
            'status' => 'FAILED',
            'retry_count' => $this->retry_count + 1,
            'last_error' => $error,
            'notification_attempted_at' => now(),
        ]);
    }

    /**
     * Snooze reminder by X minutes
     */
    public function snooze(int $minutes = 15): bool
    {
        return $this->update([
            'remind_at' => Carbon::parse($this->remind_at)->addMinutes($minutes),
            'status' => 'PENDING',
            'is_sent' => false,
        ]);
    }
}
