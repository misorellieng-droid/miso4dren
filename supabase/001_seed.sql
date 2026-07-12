-- 001_seed.sql — miso4dren
-- Seed inicial de materiais_manning e equacoes_idf.

insert into materiais_manning (material, manning_n, observacao) values
  ('CONCRETO', 0.013, 'Manual de Hidrologia DNIT'),
  ('PEAD', 0.010, 'PEAD corrugado parede dupla, interna lisa — DNIT-094/2014-EM e fabricantes (Kanaflex, ADS Tigre, Cimflex)');

insert into equacoes_idf (nome, localidade, k, a, b, c, fonte) values
  ('Equação de referência do usuário', 'a confirmar', 4003.518, 0.203, 49.996, 0.931, 'Planilha_DrenagemLimpa.xlsm');
