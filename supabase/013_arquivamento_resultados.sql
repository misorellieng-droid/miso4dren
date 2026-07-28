-- Arquivamento de relatórios salvos: permite tirar um registro superado da
-- listagem ativa do projeto sem apagá-lo — ele passa a aparecer só na página
-- global "Arquivo", com opção de restaurar.
alter table resultados_sarjeta add column if not exists arquivado boolean not null default false;
alter table resultados_sarjetao_dente_serra add column if not exists arquivado boolean not null default false;

-- Tc não era persistido (só usado pra derivar a intensidade no momento do cálculo) — precisa
-- ficar salvo pra reconstituir o memorial de cálculo fielmente ao reimprimir um registro salvo.
alter table resultados_sarjeta add column if not exists tc_min double precision;
