CREATE TABLE shifts (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    opened_by BIGINT NOT NULL REFERENCES users (id),
    opened_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    closed_at TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL DEFAULT 'open',

    CONSTRAINT shifts_status_check
        CHECK (status IN ('open', 'closed')),

    -- Turno fechado sempre tem closed_at; turno aberto nunca tem.
    CONSTRAINT shifts_closed_at_check
        CHECK ((status = 'closed') = (closed_at IS NOT NULL))
);

-- No maximo um turno aberto por vez (base do 409 em POST /shifts).
CREATE UNIQUE INDEX shifts_single_open_idx
    ON shifts (status)
    WHERE status = 'open';
