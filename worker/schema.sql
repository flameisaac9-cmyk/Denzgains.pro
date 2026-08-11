CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    merchant_reference TEXT NOT NULL UNIQUE,

    order_tracking_id TEXT,

    service_id TEXT NOT NULL,

    service_name TEXT NOT NULL,

    platform TEXT NOT NULL,

    quantity INTEGER NOT NULL,

    target_link TEXT NOT NULL,

    amount REAL NOT NULL,

    currency TEXT NOT NULL DEFAULT 'KES',

    email TEXT,

    phone TEXT,

    first_name TEXT,

    last_name TEXT,

    status TEXT NOT NULL DEFAULT 'PENDING_PAYMENT',

    provider_status TEXT,

    provider_order_id TEXT,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_orders_tracking
ON orders(order_tracking_id);

CREATE INDEX IF NOT EXISTS idx_orders_reference
ON orders(merchant_reference);

CREATE INDEX IF NOT EXISTS idx_orders_status
ON orders(status);
