<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;

/**
 * @property string $id
 * @property string $name
 * @property string $status
 * @property array $entitlements
 * @property array $limits
 * @property \Carbon\Carbon|null $created_at
 * @property \Carbon\Carbon|null $updated_at
 * @method static \Illuminate\Database\Eloquent\Builder|Plan where($column, $operator = null, $value = null)
 * @method static \Illuminate\Database\Eloquent\Builder|Plan query()
 */
class Plan extends Model
{
    use HasFactory;

    protected $table = 'plans';
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'name',
        'status',
        'entitlements',
        'limits',
    ];

    protected $casts = [
        'entitlements' => 'array',
        'limits' => 'array',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    public function users()
    {
        return $this->hasMany(BotUser::class, 'assigned_plan_id', 'id');
    }

    public function hasFeature(string $feature): bool
    {
        $features = is_array($this->entitlements) ? $this->entitlements : [];
        return in_array($feature, $features, true);
    }
}
