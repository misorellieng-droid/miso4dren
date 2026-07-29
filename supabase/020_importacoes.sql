-- Rastreia cada importação (rede LandXML, bacias por Parcel, bacias por CSV)
-- como um lote — mostra o que veio em cada arquivo e permite excluir o lote
-- inteiro de uma vez, em vez de apagar caixa por caixa/bacia por bacia
-- manualmente (útil pra limpar um teste com dado errado sem bagunçar o
-- resto da revisão).

create table importacoes (
  id uuid primary key default gen_random_uuid(),
  revisao_id uuid references revisoes(id) on delete cascade not null,
  tipo text not null check (tipo in ('rede_landxml', 'bacias_parcel_landxml', 'bacias_csv')),
  nome_arquivo text,
  resumo text not null,
  criado_em timestamptz default now()
);

alter table importacoes enable row level security;
create policy "acesso aberto (sem login)" on importacoes for all using (true) with check (true);

-- sem "on delete cascade" de propósito: a exclusão de um lote é feita em
-- ordem explícita pelo app (resultados_rede -> trechos -> caixas -> bacias ->
-- importacoes), pra dar um erro claro em vez de cascatear silenciosamente se
-- outro lote (reimportação depois) passou a depender de uma caixa/trecho
-- deste.
alter table caixas add column if not exists importacao_id uuid references importacoes(id);
alter table trechos add column if not exists importacao_id uuid references importacoes(id);
alter table bacias add column if not exists importacao_id uuid references importacoes(id);
