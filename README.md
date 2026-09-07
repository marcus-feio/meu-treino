# Treino — app pessoal de gestão de treinos

App instalável no iPhone (PWA), sem passar pela App Store. Funciona offline depois de instalado.

## O que ele faz
- Importa o PDF do seu treino e extrai exercícios, séries, repetições, carga e descanso automaticamente
- Tela **Hoje**: mostra o treino do dia (alterna entre A/B/C...) e deixa você registrar séries/reps/carga realmente feitos
- Tela **Treinos**: modelos importados, editáveis
- Tela **Progresso**: frequência (calendário do mês, sequência de dias, treinos na semana) e evolução de carga por exercício
- Tela **Avaliação**: importa o PDF da avaliação de bioimpedância (padrão BlueFit/FitMass), extrai peso, %gordura, massa muscular, IMC, metabolismo basal, análise segmentar e score, e mostra a evolução entre avaliações
- Tudo fica salvo **no seu próprio iPhone** (localStorage do Safari) — nada é enviado para nenhum servidor

## Passo 1 — Gerar o treino com o Gemini no formato certo
Para a leitura do PDF funcionar bem, o treino precisa seguir um formato simples. Dentro do app, no botão **"+"** da aba Treinos, toque em **"Ver modelo para o Gemini"** e copie o texto — cole isso no início da sua conversa com o Gemini antes de pedir o treino. Depois, exporte a resposta dele como PDF (no app do Gemini ou copiando o texto para um editor e usando "Exportar como PDF").

Formato esperado:
```
# TREINO A — Peito e Tríceps
1. Supino reto | 4x10-12 | 40kg | descanso 90s
2. Crucifixo com halteres | 3x12 | 14kg | descanso 60s

# TREINO B — Costas e Bíceps
1. Puxada frente | 4x10-12 | 45kg | descanso 90s
```

## Passo 2 — Publicar o app (necessário para instalar no iPhone)
O iPhone só permite "Adicionar à Tela de Início" como app de verdade (com ícone, tela cheia e modo offline) para páginas servidas por **HTTPS**. A forma mais simples e gratuita é o GitHub Pages:

1. Crie uma conta em https://github.com (se ainda não tiver)
2. Crie um novo repositório (pode ser privado), ex: `meu-treino`
3. Faça upload de **todos os arquivos desta pasta** (mantendo a subpasta `icons/` e `vendor/`) para esse repositório — pelo site do GitHub mesmo: "Add file" → "Upload files", arraste tudo
4. Vá em **Settings → Pages**, em "Branch" selecione `main` e pasta `/ (root)`, salve
5. Espere ~1 minuto. O GitHub vai te dar uma URL tipo `https://seu-usuario.github.io/meu-treino/`

## Passo 3 — Instalar no iPhone
1. Abra essa URL no **Safari** (precisa ser Safari, não Chrome)
2. Toque no ícone de compartilhar (quadrado com seta para cima)
3. Toque em **"Adicionar à Tela de Início"**
4. Pronto — o app "Treino" aparece na sua tela como qualquer outro app, abre em tela cheia e funciona offline

## Avaliação física
Na aba **Avaliação**, toque no "+" e selecione o PDF da sua bioimpedância (BlueFit/FitMass). O app já reconhece o layout padrão desse relatório. Depois de ler, ele mostra os valores extraídos para você conferir antes de salvar — se algum campo vier errado (relatório de outro app, layout diferente), você pode corrigir na hora.

## Atualizações
Sempre que quiser mudar algo no app, edite os arquivos e suba de novo pro mesmo repositório GitHub. Na próxima vez que abrir o app no iPhone (com internet), ele atualiza sozinho em segundo plano.
