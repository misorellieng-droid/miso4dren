-- Mudança de método de cálculo da vazão: em vez de somar vazões de pico já
-- prontas de cada bacia (cada uma com seu próprio Tc), agora acumula-se
-- Σ(C×A) pela rede e aplica-se a intensidade do Tc do sistema (caminho
-- crítico) em cada trecho — método padrão de dimensionamento de rede
-- pluvial. Guarda o ΣCA acumulado pra exibir na memória de cálculo.
alter table resultados_rede add column if not exists ca_acumulado double precision;
