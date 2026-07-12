-- 003_sarjeta_manning_completo.sql — miso4dren
-- O módulo de sarjeta crítica passou da fórmula fechada (válida só pra
-- seção triangular ideal, parametrizada por Y0/Z) para a sequência completa
-- via equação de Manning (geometria → velocidade → vazão → comprimento
-- crítico), com suporte a sarjeta com depressão (declividade da via e da
-- sarjeta em separado). A coluna "z" fica obsoleta; os novos campos guardam
-- a geometria de entrada e os resultados intermediários do memorial de cálculo.

alter table resultados_sarjeta alter column z drop not null;
comment on column resultados_sarjeta.z is 'Obsoleto — recíproca da declividade transversal, da fórmula fechada antiga. Substituído por declividade_transversal_via_m_m / declividade_transversal_sarjeta_m_m (equação completa de Manning).';

alter table resultados_sarjeta add column if not exists largura_sarjeta_m double precision;
alter table resultados_sarjeta add column if not exists declividade_transversal_via_m_m double precision;
alter table resultados_sarjeta add column if not exists declividade_transversal_sarjeta_m_m double precision;
alter table resultados_sarjeta add column if not exists area_molhada_m2 double precision;
alter table resultados_sarjeta add column if not exists perimetro_molhado_m double precision;
alter table resultados_sarjeta add column if not exists raio_hidraulico_m double precision;
alter table resultados_sarjeta add column if not exists velocidade_ms double precision;
alter table resultados_sarjeta add column if not exists vazao_m3s double precision;
