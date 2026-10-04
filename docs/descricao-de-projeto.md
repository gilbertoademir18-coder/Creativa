# A descrição do projeto

A descrição do projeto é a "bíblia" dele: premissa, estilo, mundo,
personagens. Quem lê é você e é a **LLM dos assistentes de prompt**. Por isso
ela segue um modelo com títulos fixos: o Creativa recorta a descrição pelos
títulos e manda ao assistente só as seções que servem àquela geração.

Para escrever ou revisar uma descrição com o Claude Code, use a skill
`/descricao-projeto` (em `.claude/skills/descricao-projeto/`). Ela segue este
documento, parte sempre da versão mais recente e grava uma versão nova. O
histórico fica no painel de versões, à esquerda na janela da descrição do projeto.

## O modelo

Os títulos são `##` e têm que ser **exatamente estes**. Maiúsculas e acentos
não importam, mas um título com outro nome vira texto só para leitura humana.
A ordem é a da tabela. Pode faltar seção: o que não existe não vai.

| Seção | O que vai nela | Vai para o assistente? |
| --- | --- | --- |
| `## Premissa` | Uma ou duas frases: quem, quer o quê, o que atrapalha. O gancho. | Sempre |
| `## Formato` | Duração, proporção, plataforma, estrutura de um episódio. | Não |
| `## Público-alvo` | Para quem é, o que já consome, o que deve sentir. | Não |
| `## Tom` | 3–5 adjetivos, o tipo de humor ou drama, e o que o projeto **não** é. | Sempre |
| `## Estilo visual` | A técnica e o look, em palavras **visíveis** (ver abaixo). | Imagem, vídeo e outro |
| `## Mundo` | Onde e quando, regras (do poder, da magia, da tecnologia), lugares que voltam. | Sempre |
| `## Personagens` | Uma ficha `###` por personagem. | Só quem aparece na geração |
| `## Recorrentes` | Gags, bordões, objetos e sequências que se repetem. | Sempre |
| `## Som` | Trilha, ambiência, vozes, efeitos marcantes. | Só áudio |
| `## Evitar` | O que nunca pode aparecer. | Sempre |
| `## Referências` | Obras que inspiram, com o que se pega de cada uma. | **Nunca** |

"Vai para o assistente" depende da saída do **tipo de geração** do workflow
(imagem, vídeo, áudio, outro).

## Personagens

Cada personagem é um `###` dentro de `## Personagens`. Se ela tem outro nome
(uma forma transformada, um apelido), ponha entre parênteses no título:
`### Lia (Prompt)`. O Creativa manda a ficha quando **qualquer um** desses
nomes aparece na ideia, no nome ou na descrição do asset, na cena ou no shot.
Por isso o título leva só nomes, sem "a protagonista" ou "— 14 anos".

A ficha é uma lista com estes rótulos, nesta ordem (pule o que não se aplica):

```markdown
### Lia (Prompt)
- **Papel:** protagonista; vira a garota mágica Prompt.
- **Idade:** 13 anos.
- **Aparência:** rosto, olhos, cabelo, corpo e roupa de sempre, em detalhe.
- **Aparência transformada:** só se ela se transforma.
- **Cor-tema:** a cor que identifica a personagem.
- **Personalidade:** como age, do que gosta, o que a irrita.
- **Jeito de falar:** bordões, vícios de linguagem.
```

**A aparência é a parte mais importante:** é dela que o assistente tira o
retrato da personagem em toda geração. Escreva o que se vê: "cabelo rosa-chiclete
até o ombro, duas mechas presas com presilhas de estrela", e não "cabelo bonito
e marcante". O detalhe longo de uma personagem pode morar também na descrição
do asset dela. A ficha do projeto é o resumo que nunca muda.

## Estilo visual: palavras que viram imagem

Nesta seção, escreva só o que um modelo de imagem consegue desenhar:

- **A técnica:** anime 2D com cel shading, foto real, 3D estilizado, aquarela.
- **A linha e a forma:** traço limpo e grosso, rostos redondos, olhos enormes com brilho.
- **A paleta:** cores com nome ("rosa-chiclete, amarelo-gema, céu azul-claro"), saturação, contraste.
- **A luz:** dia claro e chapado, contraluz dourada, neon.
- **A câmera:** enquadramentos e movimentos típicos.
- **Os efeitos:** brilhos, linhas de velocidade, caretas de comédia.

**Nada de nomes de obras, estúdios ou artistas nesta seção.** Eles vão em
`## Referências`, que nunca chega ao assistente. Os modelos de imagem não sabem
reproduzir "o estilo de X" de forma confiável, e o assistente de placa proíbe
nomes. O que se quer pegar da referência, descreva aqui com as próprias palavras.

## Tamanho

Cada seção que vai para o assistente é cortada em 2.500 caracteres. Seja
direto: o que passar disso não chega. Uma descrição inteira de 1.000 a 2.000
palavras é uma boa medida.

## Idioma

Em português. Quem passa para o inglês do prompt é o assistente.
