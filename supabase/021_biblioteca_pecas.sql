-- Biblioteca de peças (catálogo material+diâmetro -> espessura de parede),
-- espelhando o Parts List real do Civil 3D do usuário. Duas finalidades:
-- 1) export (landxmlPatch.ts): quando um trecho tem o diâmetro editado, o
--    Civil só aceita a troca de volta se a espessura de parede bater EXATO
--    com a peça de catálogo do tamanho novo -- sem isso ele mantém o tubo
--    antigo ("Part Family... found, but an exact match... was not").
-- 2) edição de diâmetro no app (Rede Pluvial / Rede Importada): vira um
--    dropdown só com os itens daqui, em vez de número livre -- impossível
--    escolher um diâmetro que não existe de verdade no catálogo do Civil.

create table biblioteca_pecas (
  id uuid primary key default gen_random_uuid(),
  material text not null,
  diametro_m double precision not null,
  espessura_parede_m double precision,
  nome_peca text,
  created_at timestamptz default now(),
  unique (material, diametro_m)
);

alter table biblioteca_pecas enable row level security;
create policy "acesso aberto (sem login)" on biblioteca_pecas for all using (true) with check (true);

-- Catálogo "BUEIRO" (Concrete Pipe SI) informado pelo usuário.
insert into biblioteca_pecas (material, diametro_m, espessura_parede_m, nome_peca) values
  ('CONCRETO', 0.30, 0.075, 'BSTC DN 0,30 m'),
  ('CONCRETO', 0.40, 0.100, 'BSTC DN 0,40 m'),
  ('CONCRETO', 0.60, 0.125, 'BSTC DN 0,60 m'),
  ('CONCRETO', 0.80, 0.175, 'BSTC DN 0,80 m'),
  ('CONCRETO', 1.00, 0.175, 'BSTC DN 1,00 m'),
  ('CONCRETO', 1.20, 0.200, 'BSTC DN 1,20 m'),
  ('CONCRETO', 1.50, 0.225, 'BSTC DN 1,50 m')
on conflict (material, diametro_m) do nothing;
