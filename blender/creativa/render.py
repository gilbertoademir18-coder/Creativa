# Monta o blockout de um shot e renderiza a previa e o depth.
#
# Le o pedido (JSON) que a API monta em `pedidoDoBlender` (apps/api/src/geracao/
# blockout.ts diz o formato e o sistema de coordenadas) e grava:
#   - saida.previa:    o render colorido, para a pessoa olhar;
#   - saida.depth:     o mapa de profundidade (perto = claro), para o ControlNet;
#   - saida.relatorio: JSON com a faixa do depth e quanto do quadro cada
#                      personagem ocupa (o depth so segura personagem grande).
#
# Uso: blender --background --factory-startup --python render.py -- <pedido.json>
#
# Licoes dos testes de 2026-10-14 (blender/sala-de-aula/LEIA-ME.md):
# - o manequim e uma silhueta inteira: braco solto do tronco virava gente a mais;
# - Blender 5.x: o compositor e `scene.compositing_node_group`, com a saida num
#   NodeGroupOutput (nao existe mais `scene.node_tree` nem o no Composite).
import bpy, json, math, os, sys
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

pedido = json.load(open(sys.argv[sys.argv.index("--") + 1], encoding="utf-8"))
saida = pedido["saida"]

bpy.ops.wm.read_factory_settings(use_empty=True)
cena = bpy.context.scene

mundo = bpy.data.worlds.new("mundo")
mundo.use_nodes = True
mundo.node_tree.nodes["Background"].inputs["Color"].default_value = (0.62, 0.68, 0.78, 1)
mundo.node_tree.nodes["Background"].inputs["Strength"].default_value = 1.1
cena.world = mundo

# --- materiais: so a previa ve cor; o depth ve so a forma ---
def hex_rgb(h):
    h = h.lstrip("#")
    # sRGB -> linear, para a cor da previa sair como foi escrita
    return tuple(((int(h[i:i + 2], 16) / 255) ** 2.2) for i in (0, 2, 4))

CORES = {
    "parede": "#c4c8cf", "piso": "#a3b5b2", "teto": "#e2e2e6", "movel": "#c9ab86", "metal": "#8e8e94",
    "lousa": "#2e5446", "porta": "#9c8672", "vidro": "#b8cde0", "tecido": "#b9a7c4", "planta": "#6f9a5e", "pedra": "#9a9a92",
}
_mats = {}
def material(nome, cor=None):
    chave = (nome, cor)
    if chave not in _mats:
        m = bpy.data.materials.new(f"{nome}{cor or ''}")
        m.use_nodes = True
        b = m.node_tree.nodes["Principled BSDF"]
        b.inputs["Base Color"].default_value = (*hex_rgb(cor or CORES.get(nome, "#bbbbbb")), 1)
        b.inputs["Roughness"].default_value = 0.8
        _mats[chave] = m
    return _mats[chave]

def _novo(nome, mat, pai=None):
    o = bpy.context.active_object
    o.name = nome
    o.data.materials.append(mat)
    if pai:
        o.parent = pai
    return o

def caixa(nome, centro, tam, mat, rot=0.0, pai=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=centro, rotation=(0, 0, math.radians(rot)))
    o = _novo(nome, mat, pai)
    o.scale = tam
    return o

def cilindro(nome, centro, raio, altura, mat, raio_topo=None, pai=None):
    if raio_topo is None:
        bpy.ops.mesh.primitive_cylinder_add(radius=raio, depth=altura, location=centro)
    else:
        bpy.ops.mesh.primitive_cone_add(radius1=raio, radius2=raio_topo, depth=altura, location=centro)
    return _novo(nome, mat, pai)

def esfera(nome, centro, raio, mat, escala=(1, 1, 1), pai=None):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=raio, location=centro)
    o = _novo(nome, mat, pai)
    o.scale = escala
    return o

def grupo(nome, pos, rot_graus):
    bpy.ops.object.empty_add(location=(pos[0], pos[1], pos[2] if len(pos) > 2 else 0))
    g = bpy.context.active_object
    g.name = nome
    g.rotation_euler = (0, 0, math.radians(rot_graus))
    return g

# --- pecas prontas (frente = +y local, como no formato) ---
def carteira(n, pos, rot):
    g = grupo(f"carteira_{n}", pos, rot)
    M, ME = material("movel"), material("metal")
    caixa("tampo", (0, 0, 0.73), (0.62, 0.45, 0.04), M, pai=g)
    for dx in (-0.26, 0.26):
        for dy in (-0.18, 0.18):
            caixa("pe", (dx, dy, 0.355), (0.04, 0.04, 0.71), ME, pai=g)
    caixa("assento", (0, -0.52, 0.45), (0.40, 0.38, 0.04), M, pai=g)
    caixa("encosto", (0, -0.70, 0.66), (0.40, 0.04, 0.38), M, pai=g)
    for dx in (-0.16, 0.16):
        for dy in (-0.16, 0.16):
            caixa("pe_cadeira", (dx, -0.52 + dy, 0.215), (0.03, 0.03, 0.43), ME, pai=g)

def cadeira(n, pos, rot):
    g = grupo(f"cadeira_{n}", pos, rot)
    M, ME = material("movel"), material("metal")
    caixa("assento", (0, 0, 0.45), (0.40, 0.38, 0.04), M, pai=g)
    caixa("encosto", (0, -0.18, 0.66), (0.40, 0.04, 0.38), M, pai=g)
    for dx in (-0.16, 0.16):
        for dy in (-0.16, 0.16):
            caixa("pe", (dx, dy, 0.215), (0.03, 0.03, 0.43), ME, pai=g)

def mesa(n, pos, tam, rot):
    g = grupo(f"mesa_{n}", pos, rot)
    w, d, h = tam
    caixa("tampo", (0, 0, h - 0.02), (w, d, 0.04), material("movel"), pai=g)
    for dx in (-w / 2 + 0.05, w / 2 - 0.05):
        for dy in (-d / 2 + 0.05, d / 2 - 0.05):
            caixa("pe", (dx, dy, (h - 0.04) / 2), (0.05, 0.05, h - 0.04), material("metal"), pai=g)

def peca(n, p):
    t = p["tipo"]
    if t == "caixa":
        x, y, z = p["pos"]
        caixa(p.get("nome") or f"caixa_{n}", (x, y, z + p["tam"][2] / 2), p["tam"], material(p.get("material", "movel"), p.get("cor")), p.get("rot", 0))
    elif t == "cilindro":
        x, y, z = p["pos"]
        cilindro(p.get("nome") or f"cilindro_{n}", (x, y, z + p["altura"] / 2), p["raio"], p["altura"], material(p.get("material", "movel"), p.get("cor")))
    elif t == "carteira":
        carteira(n, p["pos"], p.get("rot", 0))
    elif t == "cadeira":
        cadeira(n, p["pos"], p.get("rot", 0))
    elif t == "mesa":
        mesa(n, p["pos"], p["tam"], p.get("rot", 0))

# --- o cenario ---
ESP = 0.12  # espessura das paredes

def montar_exterior(c, L, P):
    """O lado de fora das janelas: chao, arvores e predios ao longe.

    Sem isso a janela e um buraco para o infinito, e o depth fica preto e liso
    numa area grande — com o ControlNet forte, isso vira mosaico de pixels
    (visto em 2026-10-15). Com algo la fora, a janela tem profundidade.
    """
    tipo = c.get("exterior", "misto")
    paredes = {a["parede"] for a in c.get("aberturas", []) if a["tipo"] in ("janela", "vao")}
    if tipo == "nada" or not paredes:
        return
    import random
    sorte = random.Random(7)
    caixa("chao_externo", (0, 0, -0.12), (400, 400, 0.1), material("planta"))
    VERDE, PREDIO, TRONCO = material("planta"), material("pedra"), material("movel")
    for parede in paredes:
        for i in range(28):
            dist = sorte.uniform(9, 45)          # da parede para fora
            ao_longo = sorte.uniform(-40, 40)
            if parede == "esquerda":
                x, y = -L / 2 - dist, ao_longo
            elif parede == "direita":
                x, y = L / 2 + dist, ao_longo
            elif parede == "frente":
                x, y = ao_longo, P / 2 + dist
            else:
                x, y = ao_longo, -P / 2 - dist
            arvore = tipo == "arvores" or (tipo == "misto" and sorte.random() < 0.6)
            if arvore:
                h = sorte.uniform(3.5, 8)
                cilindro(f"tronco_{parede}_{i}", (x, y, h * 0.3), 0.25, h * 0.6, TRONCO)
                esfera(f"copa_{parede}_{i}", (x, y, h * 0.75), sorte.uniform(1.8, 3.2), VERDE, escala=(1, 1, 0.85))
            else:
                h = sorte.uniform(8, 26)
                caixa(f"predio_{parede}_{i}", (x, y, h / 2), (sorte.uniform(6, 14), sorte.uniform(6, 12), h), PREDIO)

def montar_cenario(c):
    sala = c.get("sala")
    if sala:
        L, P, A = sala["largura"], sala["profundidade"], sala["altura"]
        caixa("piso", (0, 0, -0.05), (L, P, 0.1), material("piso"))
        if sala.get("teto", True):
            caixa("teto", (0, 0, A + 0.05), (L + 2 * ESP, P + 2 * ESP, 0.1), material("teto"))
        paredes = {
            "frente": ((0, P / 2 + ESP / 2, A / 2), (L + 2 * ESP, ESP, A)),
            "fundo": ((0, -P / 2 - ESP / 2, A / 2), (L + 2 * ESP, ESP, A)),
            "esquerda": ((-L / 2 - ESP / 2, 0, A / 2), (ESP, P, A)),
            "direita": ((L / 2 + ESP / 2, 0, A / 2), (ESP, P, A)),
        }
        objs = {nome: caixa(f"parede_{nome}", centro, tam, material("parede")) for nome, (centro, tam) in paredes.items()}
        for i, a in enumerate(c.get("aberturas", [])):
            parede = a["parede"]
            lateral = parede in ("esquerda", "direita")
            (cx, cy, _), _ = paredes[parede]
            zc = a.get("base", 0) + a["altura"] / 2
            centro = (cx, a["centro"], zc) if lateral else (a["centro"], cy, zc)
            tam = (ESP * 3, a["largura"], a["altura"]) if lateral else (a["largura"], ESP * 3, a["altura"])
            corte = caixa(f"corte_{i}", centro, tam, material("parede"))
            corte.hide_render = True
            corte.display_type = "WIRE"
            mod = objs[parede].modifiers.new(f"vao_{i}", "BOOLEAN")
            mod.operation = "DIFFERENCE"
            mod.object = corte
            try:
                mod.solver = "EXACT"
            except Exception:
                pass
            if a["tipo"] == "porta":
                # a folha fechada, um pouco para fora: o vao continua lendo como porta
                folga = 0.03 if parede in ("frente", "direita") else -0.03
                fc = (cx + folga, a["centro"], zc) if lateral else (a["centro"], cy + folga, zc)
                ft = (0.04, a["largura"] - 0.02, a["altura"] - 0.01) if lateral else (a["largura"] - 0.02, 0.04, a["altura"] - 0.01)
                caixa(f"porta_{i}", fc, ft, material("porta"))
        for i, p in enumerate(c.get("paineis", [])):
            parede = p["parede"]
            lateral = parede in ("esquerda", "direita")
            zc = p["base"] + p["altura"] / 2
            if parede == "frente":
                centro, tam = (p["centro"], P / 2 - 0.03, zc), (p["largura"], 0.04, p["altura"])
            elif parede == "fundo":
                centro, tam = (p["centro"], -P / 2 + 0.03, zc), (p["largura"], 0.04, p["altura"])
            elif parede == "esquerda":
                centro, tam = (-L / 2 + 0.03, p["centro"], zc), (0.04, p["largura"], p["altura"])
            else:
                centro, tam = (L / 2 - 0.03, p["centro"], zc), (0.04, p["largura"], p["altura"])
            caixa(p.get("nome") or f"painel_{i}", centro, tam, material(p.get("material", "lousa"), p.get("cor")))
        montar_exterior(c, L, P)
    else:
        caixa("chao", (0, 0, -0.05), (200, 200, 0.1), material("pedra"))
    n = 0
    for p in c.get("pecas", []):
        peca(n, p); n += 1
    for f in c.get("fileiras", []):
        for col in range(f["colunas"]):
            for lin in range(f["linhas"]):
                pos = (f["origem"][0] + col * f["passo"][0], f["origem"][1] - lin * f["passo"][1])
                (carteira if f["peca"] == "carteira" else cadeira)(n, pos, f.get("rot", 0)); n += 1

# --- o manequim: silhueta inteira, altura da ficha, frente = +y local ---
def manequim(p):
    m = p["modelo"]
    h = m["altura"]
    k = h / 1.5
    cab = m.get("cabelo", {})
    cores = m.get("cores", {})
    PELE = material("pele", cores.get("pele", "#ccb39e"))
    CIMA = material("cima", cores.get("cima", "#d9d9e0"))
    BAIXO = material("baixo", cores.get("baixo", "#2a2e4c"))
    CABELO = material("cabelo", cab.get("cor", "#4a3a30"))

    rot = p.get("rot", 0)
    if p.get("olhaPara"):
        dx, dy = p["olhaPara"][0] - p["pos"][0], p["olhaPara"][1] - p["pos"][1]
        rot = math.degrees(math.atan2(-dx, dy))
    g = grupo(p["nome"], p["pos"], rot)

    cab_r = 0.105 * k
    sentada = p.get("pose") == "sentada"
    # Sentada, tudo da cintura para cima desce: o quadril fica no assento (0,45 m).
    z_quadril_pe = h * 0.47
    desce = (z_quadril_pe - 0.45) if sentada else 0.0
    z_cab = h - cab_r - desce
    z_ombro = h - 2 * cab_r - 0.05 * k - desce
    z_cint = h * 0.58 - desce
    z_quadril = z_quadril_pe - desce

    corpo = m.get("corpo", "calca")
    for s in (-1, 1):
        if sentada:
            # coxa para a frente (+y), canela para baixo
            caixa("coxa", (s * 0.075 * k, 0.20 * k, z_quadril), (0.11 * k, 0.42 * k, 0.11 * k), BAIXO if corpo == "calca" else PELE, pai=g)
            cilindro("canela", (s * 0.075 * k, 0.40 * k, z_quadril / 2), 0.05 * k, z_quadril, PELE, pai=g)
        else:
            cilindro("perna", (s * 0.075 * k, 0, z_quadril / 2 + 0.02), 0.055 * k, z_quadril + 0.04, BAIXO if corpo == "calca" else PELE, pai=g)
        # braco colado ao tronco, com ombro redondo (braco solto virava gente a mais)
        cilindro("braco", (s * 0.150 * k, 0, (z_cint - 0.10 * k + z_ombro - 0.02 * k) / 2), 0.042 * k, (z_ombro - 0.02 * k) - (z_cint - 0.10 * k), CIMA, pai=g)
        esfera("ombro", (s * 0.135 * k, 0, z_ombro - 0.035 * k), 0.055 * k, CIMA, pai=g)
    if corpo in ("saia", "vestido") and not sentada:
        z_barra = h * 0.40
        cilindro("saia", (0, 0, (z_barra + z_cint) / 2), 0.24 * k, z_cint - z_barra, BAIXO if corpo == "saia" else CIMA, raio_topo=0.13 * k, pai=g)
    elif corpo in ("saia", "vestido"):
        caixa("saia", (0, 0.10 * k, z_quadril + 0.02), (0.34 * k, 0.36 * k, 0.12 * k), BAIXO if corpo == "saia" else CIMA, pai=g)
    else:
        cilindro("quadril", (0, 0, (z_quadril + z_cint) / 2), 0.13 * k, z_cint - z_quadril, BAIXO, pai=g)
    cilindro("tronco", (0, 0, (z_cint + z_ombro) / 2), 0.112 * k, z_ombro - z_cint, CIMA if corpo != "vestido" else CIMA, raio_topo=0.140 * k, pai=g)
    cilindro("pescoco", (0, 0, (z_ombro + z_cab - cab_r * 0.6) / 2), 0.04 * k, (z_cab - cab_r * 0.6) - z_ombro, PELE, pai=g)
    esfera("cabeca", (0, 0, z_cab), cab_r, PELE, pai=g)
    vol = cab.get("volume", 1.18)
    esfera("cabelo", (0, -0.02 * k, z_cab + 0.005), cab_r * vol, CABELO, escala=(1.08, 1.0, 0.98), pai=g)
    if cab.get("comprimento") == "medio":
        caixa("cabelo_nuca", (0, -0.05 * k, z_cab - cab_r * 0.9), (cab_r * 1.9, cab_r * 1.2, cab_r * 1.2), CABELO, pai=g)
    elif cab.get("comprimento") == "longo":
        caixa("cabelo_costas", (0, -0.07 * k, z_cab - cab_r * 2.0), (cab_r * 1.9, cab_r * 0.9, cab_r * 3.2), CABELO, pai=g)
    return g, z_cab + cab_r * vol

# --- montar ---
montar_cenario(pedido["cenario"])
for i, p in enumerate(pedido.get("pecas", [])):
    peca(1000 + i, p)
alturas = {}
for p in pedido.get("personagens", []):
    g, topo = manequim(p)
    alturas[p["nome"]] = (g, topo)

# luz: um sol suave e um preenchimento; so a previa usa
bpy.ops.object.light_add(type="SUN", location=(0, 0, 10))
sol = bpy.context.active_object
sol.data.energy = 4.5
sol.data.angle = math.radians(5)
sol.rotation_euler = (math.radians(50), math.radians(20), math.radians(-30))
bpy.ops.object.light_add(type="AREA", location=(0, 0, 3.0))
pre = bpy.context.active_object
pre.data.energy = 450
pre.data.size = 7

cam_d = pedido["camera"]
bpy.ops.object.camera_add(location=cam_d["pos"])
cam = bpy.context.active_object
cam.name = "camera"
cam.data.lens = cam_d["lente"]
cam.rotation_euler = (Vector(cam_d["alvo"]) - Vector(cam_d["pos"])).to_track_quat("-Z", "Y").to_euler()
cena.camera = cam

r = pedido["render"]
cena.render.resolution_x, cena.render.resolution_y, cena.render.resolution_percentage = r["largura"], r["altura"], 100
motores = [i.identifier for i in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
cena.render.engine = next((e for e in motores if "EEVEE" in e), motores[0])
try:
    cena.eevee.taa_render_samples = 32
except Exception:
    pass
bpy.context.view_layer.update()

# --- o mais perto que a camera ve: e o branco do depth ---
frente = (Vector(cam_d["alvo"]) - Vector(cam_d["pos"])).normalized()
dists = []
for o in cena.objects:
    if o.type != "MESH" or o.hide_render or o.name.startswith(("chao", "tronco_", "copa_", "predio_")):
        continue
    for canto in o.bound_box:
        mundo_p = o.matrix_world @ Vector(canto)
        v = world_to_camera_view(cena, cam, mundo_p)
        if 0 <= v.x <= 1 and 0 <= v.y <= 1 and v.z > 0:
            dists.append((mundo_p - cam.location).dot(frente))
perto = max(0.1, min(dists) * 0.9) if dists else 0.5
LONGE = 120.0  # o que passa disso (o ceu) fica preto

# --- o enquadramento de cada personagem: quanto do quadro, onde, virada para onde ---
def virada(g):
    """De frente, de perfil ou de costas para a camera (a frente do manequim e +y local)."""
    rumo = (g.matrix_world.to_3x3() @ Vector((0, 1, 0))).to_2d().normalized()
    para_cam = (cam.location - g.matrix_world.translation).to_2d().normalized()
    ang = math.degrees(math.acos(max(-1.0, min(1.0, rumo.dot(para_cam)))))
    if ang < 55:
        return "de frente"
    if ang > 125:
        return "de costas"
    # de perfil: para que lado do quadro ela olha
    direita_cam = (cam.matrix_world.to_3x3() @ Vector((1, 0, 0))).to_2d()
    return "de perfil, olhando para a direita do quadro" if rumo.dot(direita_cam) > 0 else "de perfil, olhando para a esquerda do quadro"

relatorio = {"depth": {"mapa": "disparidade", "perto": round(perto, 3), "longe": LONGE}, "personagens": []}
for nome, (g, topo) in alturas.items():
    base = world_to_camera_view(cena, cam, g.matrix_world @ Vector((0, 0, 0)))
    alto = world_to_camera_view(cena, cam, g.matrix_world @ Vector((0, 0, topo)))
    cx = (base.x + alto.x) / 2
    relatorio["personagens"].append({
        "nome": nome,
        "alturaNoQuadro": round(max(0.0, min(alto.y, 1) - max(base.y, 0)), 3),
        "centroX": round(cx, 3),
        "lado": "à esquerda" if cx < 0.4 else "à direita" if cx > 0.6 else "no centro",
        "virada": virada(g),
        "cortada": base.y < -0.02,
        "naFrente": base.z > 0,
        "dentro": 0 <= alto.x <= 1 and base.y < 1 and alto.y > 0,
    })

# --- passada 1: a previa ---
cena.render.image_settings.file_format = "PNG"
cena.render.image_settings.color_mode = "RGB"
cena.render.filepath = saida["previa"]
bpy.ops.render.render(write_still=True)

# --- passada 2: o depth em disparidade (perto/distancia), sem view transform ---
# Como os mapas de depth com que os ControlNets sao treinados: o mais perto e
# branco, cai rapido nos primeiros metros e o longe ainda se distingue do ceu.
# (Mist linear ate o fundo achataria a sala quando ha arvores a 40 m.)
bpy.context.view_layer.use_pass_z = True
grupo_c = bpy.data.node_groups.new("Depth", "CompositorNodeTree")
grupo_c.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
cena.use_nodes = True
cena.compositing_node_group = grupo_c
rl = grupo_c.nodes.new("CompositorNodeRLayers")
out = grupo_c.nodes.new("NodeGroupOutput")

def conta(op, a, b, prender=False):
    n = grupo_c.nodes.new("ShaderNodeMath")
    n.operation = op
    n.use_clamp = prender
    for i, v in enumerate((a, b)):
        if isinstance(v, (int, float)):
            n.inputs[i].default_value = v
        else:
            grupo_c.links.new(v, n.inputs[i])
    return n.outputs[0]

# (perto/Z - perto/longe) / (1 - perto/longe), preso entre 0 e 1
d = conta("DIVIDE", perto, rl.outputs["Depth"])
d = conta("SUBTRACT", d, perto / LONGE)
d = conta("DIVIDE", d, 1 - perto / LONGE, prender=True)
grupo_c.links.new(d, out.inputs[0])
cena.view_settings.view_transform = "Raw"
cena.render.image_settings.color_mode = "BW"
cena.render.filepath = saida["depth"]
bpy.ops.render.render(write_still=True)

if saida.get("blend"):
    bpy.ops.wm.save_as_mainfile(filepath=saida["blend"])
with open(saida["relatorio"], "w", encoding="utf-8") as f:
    json.dump(relatorio, f, ensure_ascii=False, indent=1)
print("[creativa] pronto")
