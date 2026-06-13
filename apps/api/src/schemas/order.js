'use strict';

const { z } = require('zod');

// Validation schemas for the order-creation input (architecture §27), MINUS add-ons
// (Cuts Register C-02 — add-ons are a v1 cut) and MINUS loyalty *math* (S17). Every
// schema is .strict() so unknown keys are rejected outright — a stray `addons` key on an
// item, or any unexpected top-level field, fails validation rather than passing silently.

const OrderItemSchema = z
  .object({
    item_id: z.string().uuid(),
    quantity: z.number().int().min(1).max(50),
  })
  .strict(); // no `addons` — C-02

const DeliveryAddressSchema = z
  .object({
    line1: z.string().min(5).max(200),
    city: z.string().min(2).max(100),
    pincode: z.string().regex(/^\d{6}$/),
    lat: z.number().min(17).max(18), // Hyderabad bounding box (§27)
    lng: z.number().min(78).max(79),
  })
  .strict();

// Same-day-only scheduling (§20): must be in the future and no later than end of today.
// undefined is allowed (field is optional) → returns true so .refine() passes it through.
function isLaterToday(val) {
  if (!val) return true;
  const scheduled = new Date(val);
  const now = new Date();
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);
  return scheduled > now && scheduled <= endOfDay;
}

const CreateOrderSchema = z
  .object({
    idempotency_key: z.string().uuid(),
    items: z.array(OrderItemSchema).min(1).max(50),
    order_type: z.enum(['delivery', 'dine_in']),
    table_id: z.string().uuid().optional(),
    delivery_address: DeliveryAddressSchema.optional(),
    scheduled_at: z
      .string()
      .datetime()
      .optional()
      .refine(isLaterToday, { message: 'Scheduled time must be later today' }),
    // Valid input field; the SERVICE layer rejecting redemption until S17 is a later
    // concern, not validation's.
    loyalty_points_to_redeem: z.number().int().min(0).default(0),
  })
  .strict()
  .refine((data) => !(data.order_type === 'delivery' && !data.delivery_address), {
    message: 'delivery orders require delivery_address',
    path: ['delivery_address'],
  })
  .refine((data) => !(data.order_type === 'dine_in' && !data.table_id), {
    message: 'dine_in orders require table_id',
    path: ['table_id'],
  });

/**
 * Inferred input types (documentary only — apps/api is CommonJS, not type-checked).
 * @typedef {import('zod').infer<typeof OrderItemSchema>} OrderItem
 * @typedef {import('zod').infer<typeof DeliveryAddressSchema>} DeliveryAddress
 * @typedef {import('zod').infer<typeof CreateOrderSchema>} CreateOrderInput
 */

module.exports = {
  OrderItemSchema,
  DeliveryAddressSchema,
  CreateOrderSchema,
};
