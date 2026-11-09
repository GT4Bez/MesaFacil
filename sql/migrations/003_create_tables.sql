CREATE TABLE tables (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    number INTEGER NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'available',

    CONSTRAINT tables_number_check
        CHECK (number > 0),

    CONSTRAINT tables_status_check
        CHECK (status IN ('available', 'occupied'))
);
