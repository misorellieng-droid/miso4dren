-- 009_bacia_dispositivo_rateio.sql — miso4dren
-- Dissocia bacia e dispositivo (caixa) numa relação muitos-para-muitos com
-- rateio percentual, em vez do vínculo 1:1 escalar (bacias.caixa_destino_id)
-- usado até aqui. Motivação: bacias reais raramente descarregam num único
-- ponto — um dispositivo pode captar de mais de uma bacia, e uma bacia pode
-- alimentar mais de um dispositivo.
--
-- Duas origens de percentual:
--   'manual'        — estimado pelo engenheiro (pátio sem rede de condução
--                      clara, cobertura dividida entre calhas etc.), fica
--                      travado até ser editado de novo.
--   'derivado_rede'  — calculado a partir da posição geométrica de um
--                      divisor de águas conhecido (ex.: módulo de sarjetão
--                      em dente de serra). Ainda não populado
--                      automaticamente por nenhum módulo nesta migração —
--                      só o valor do enum já existe, pronto para quando essa
--                      integração for construída.

create table bacia_dispositivo (
  id uuid primary key default gen_random_uuid(),
  bacia_id uuid references bacias(id) on delete cascade not null,
  dispositivo_id uuid references caixas(id) on delete cascade not null,
  percentual numeric not null check (percentual > 0 and percentual <= 100),
  origem text not null check (origem in ('derivado_rede', 'manual')),
  atualizado_em timestamptz default now(),
  unique (bacia_id, dispositivo_id)
);

comment on table bacia_dispositivo is 'Relação muitos-para-muitos entre bacias e dispositivos (caixas), com percentual de rateio da vazão da bacia captado por cada dispositivo.';
comment on column bacia_dispositivo.dispositivo_id is 'Referencia caixas(id) — "dispositivo" no app de hoje é uma linha de caixas (pv | boca_de_lobo | caixa_passagem). Nome da coluna usa o termo genérico do domínio.';
comment on column bacia_dispositivo.origem is '''manual'' (estimado pelo engenheiro, editável livremente) | ''derivado_rede'' (calculado da geometria da rede — ainda sem gatilho automático nesta migração, só o valor do enum).';

alter table bacia_dispositivo enable row level security;

-- mesmo modo "sem login" adotado no resto do app (ver 002_modo_sem_login.sql)
create policy "acesso aberto (sem login)" on bacia_dispositivo for all using (true) with check (true);

-- Valida em nível de banco (constraint de agregação não é possível direto em
-- check — usa trigger) que a soma dos percentuais de uma bacia nunca passa
-- de 100%, mesmo com múltiplos usuários editando ao mesmo tempo. O aviso de
-- "soma < 100%, declare o destino do restante" fica só no frontend — não é
-- um estado inválido do ponto de vista do banco, só incompleto.
create or replace function check_percentual_bacia() returns trigger as $$
declare
  soma numeric;
begin
  select coalesce(sum(percentual), 0) into soma
  from bacia_dispositivo
  where bacia_id = new.bacia_id
    and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

  if soma + new.percentual > 100 then
    raise exception 'Soma dos percentuais da bacia ultrapassa 100%% (% + % = %)', soma, new.percentual, soma + new.percentual;
  end if;

  return new;
end;
$$ language plpgsql;

create trigger trg_check_percentual_bacia
  before insert or update on bacia_dispositivo
  for each row execute function check_percentual_bacia();

-- Quando a soma dos percentuais de uma bacia fica abaixo de 100%, a UI exige
-- que o engenheiro declare explicitamente o destino do restante (dispositivo
-- a jusante fora da bacia modelada, infiltração, vazão residual não tratada
-- etc.) em vez de deixar isso implícito/silencioso.
alter table bacias add column if not exists destino_restante_nao_captado text;
comment on column bacias.destino_restante_nao_captado is 'Declaração explícita do engenheiro sobre o destino do percentual não captado por nenhum dispositivo (soma de bacia_dispositivo < 100%). Exigido pela UI nesse cenário.';

-- Backfill: todo vínculo 1:1 já resolvido (bacias.caixa_destino_id
-- preenchido) vira uma linha aqui com 100% de rateio, origem 'manual' (era
-- uma estimativa/decisão do engenheiro, automática ou não na resolução do
-- vínculo — mas o percentual em si sempre foi implicitamente 100%, nunca
-- calculado da rede).
insert into bacia_dispositivo (bacia_id, dispositivo_id, percentual, origem)
select id, caixa_destino_id, 100, 'manual'
from bacias
where caixa_destino_id is not null
on conflict (bacia_id, dispositivo_id) do nothing;

-- bacias.caixa_destino_id / vinculo_status ficam como legado (não dropados,
-- para não quebrar leitura de dados históricos) — bacia_dispositivo passa a
-- ser a fonte de verdade a partir de agora.
comment on column bacias.caixa_destino_id is 'Legado — pré-rateio percentual (ver bacia_dispositivo, 009_bacia_dispositivo_rateio.sql). Não é mais escrito pelo app; mantido só para dados históricos.';
comment on column bacias.vinculo_status is 'Legado — ver comentário de caixa_destino_id.';
