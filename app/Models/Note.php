<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;

/**
 * @property int $id
 * @property string $user_id
 * @property string $content
 * @property string $tags
 * @property bool $is_pinned
 * @property \Carbon\Carbon|null $created_at
 * @property \Carbon\Carbon|null $updated_at
 * @method static Builder|Note query()
 * @method static Builder|Note where($column, $operator = null, $value = null)
 * @method static Builder|Note latest($column = null)
 * @method static Note create(array $attributes = [])
 * @method static Note findOrFail($id)
 * @method static int count($columns = '*')
 */
class Note extends Model
{
    use HasFactory;

    protected $table = 'notes';

    protected $fillable = [
        'user_id',
        'content',
        'tags',
        'is_pinned',
    ];

    protected $casts = [
        'is_pinned' => 'boolean',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    /**
     * Scope: Filter by user ID
     */
    public function scopeForUser(Builder $query, string $userId)
    {
        return $query->where('user_id', $userId);
    }

    /**
     * Scope: Search in content or tags
     */
    public function scopeSearch(Builder $query, ?string $keyword)
    {
        if (!$keyword) return $query;
        return $query->where(function ($q) use ($keyword) {
            $q->where('content', 'like', "%{$keyword}%")
              ->orWhere('tags', 'like', "%{$keyword}%");
        });
    }
}
