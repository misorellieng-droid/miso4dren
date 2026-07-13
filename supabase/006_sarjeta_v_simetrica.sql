-- 006_sarjeta_v_simetrica.sql — miso4dren
-- Suporte a sarjetão em V simétrico (dois lados, mesma declividade
-- transversal) e ao modo "declividade calculada a partir da velocidade
-- mínima" — caso de vias sem declividade longitudinal (ex.: pátio entre
-- galpões), onde a queda é dada só ao longo da calha.

alter table resultados_sarjeta add column if not exists tipo_secao text not null default 'triangular';
alter table resultados_sarjeta add column if not exists velocidade_minima_ms double precision;
alter table resultados_sarjeta add column if not exists declividade_calculada_por_velocidade boolean not null default false;

comment on column resultados_sarjeta.tipo_secao is '''triangular'' (via + calha) ou ''triangular_simetrica'' (sarjetão em V, dois lados).';
comment on column resultados_sarjeta.velocidade_minima_ms is 'Velocidade mínima de autolimpeza usada para derivar declividade_longitudinal, quando declividade_calculada_por_velocidade = true.';
