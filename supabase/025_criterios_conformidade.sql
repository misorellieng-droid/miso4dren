-- Critérios de conformidade (y/D, velocidade, declividade, diâmetro mínimo por categoria, escopo
-- do EGL) viviam só em useState na tela Rede Pluvial -- voltavam pro padrão do sistema toda vez
-- que a página recarregava, mesmo já tendo sido ajustados pro projeto. Move pra revisoes, então
-- ficam vinculados à revisão (todo estudo dessa versão adota os mesmos critérios) e persistem
-- entre sessões/recarregamentos.

alter table revisoes add column criterio_limite_yd double precision default 0.75;
alter table revisoes add column criterio_vel_min_ms double precision default 0.6;
alter table revisoes add column criterio_vel_max_ms double precision default 5;
alter table revisoes add column criterio_decl_min_mm double precision default 0.003;
alter table revisoes add column criterio_decl_max_mm double precision default 0.15;
alter table revisoes add column criterio_diametro_min_tronco_m double precision default 0.4;
alter table revisoes add column criterio_diametro_min_ramal_m double precision default 0.3;
alter table revisoes add column criterio_energia_so_tronco boolean default false;
