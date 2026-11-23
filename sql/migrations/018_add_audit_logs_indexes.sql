-- RN-20 (spec 017): consulta da trilha por pessoa e por ação, sempre do mais recente para o mais antigo.
CREATE INDEX audit_logs_user_idx ON audit_logs (user_id, id DESC);
CREATE INDEX audit_logs_action_idx ON audit_logs (action, id DESC);
