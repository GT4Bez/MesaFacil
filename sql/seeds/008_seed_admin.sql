-- Superadmin de demonstração (RN-16). Senha "123" apenas para desenvolvimento e testes locais:
-- nunca aplicar este seed em produção.
INSERT INTO users (name, email, password_hash, role)
VALUES ('Administrador', 'admin@mesafacil.com', '$2b$10$kJ134m35p49RlbtXfTmXqeYGQ22alfPqCuvKeppb5MvKe68j/Q1uC', 'admin');
