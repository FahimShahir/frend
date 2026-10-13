<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Carbon\Carbon;

/**
 * @property string $user_id
 * @property int $points
 * @property int $level
 * @property int $streak_days
 * @property string|null $last_active_date
 * @property int $tasks_completed
 * @property \Carbon\Carbon|null $created_at
 * @property \Carbon\Carbon|null $updated_at
 * @method static \Illuminate\Database\Eloquent\Builder|Gamification where($column, $operator = null, $value = null)
 * @method static \Illuminate\Database\Eloquent\Builder|Gamification query()
 * @method static Gamification firstOrCreate(array $attributes = [], array $values = [])
 */
class Gamification extends Model
{
    use HasFactory;

    protected $table = 'user_gamification';
    protected $primaryKey = 'user_id';
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'user_id',
        'points',
        'level',
        'streak_days',
        'last_active_date',
        'tasks_completed',
    ];

    protected $casts = [
        'points' => 'integer',
        'level' => 'integer',
        'streak_days' => 'integer',
        'tasks_completed' => 'integer',
        'last_active_date' => 'date',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    /**
     * Add XP and calculate level
     */
    public function addPoints(int $pts): self
    {
        $this->points += $pts;
        $this->level = max(1, (int) floor(sqrt($this->points / 50)) + 1);
        $this->save();
        return $this;
    }

    /**
     * Increment completed task and maintain streak
     */
    public function recordTaskCompletion(): self
    {
        $today = Carbon::today('Asia/Dhaka');
        $yesterday = Carbon::yesterday('Asia/Dhaka');

        if ($this->last_active_date) {
            $last = Carbon::parse($this->last_active_date);
            if ($last->equalTo($yesterday)) {
                $this->streak_days += 1;
            } elseif (!$last->equalTo($today)) {
                $this->streak_days = 1;
            }
        } else {
            $this->streak_days = 1;
        }

        $this->last_active_date = $today->toDateString();
        $this->tasks_completed += 1;
        $this->addPoints(10);
        $this->save();

        return $this;
    }
}
