# Blockout de sala de aula para guiar o first frame.
# Sem detalhe de proposito: o que importa e a geometria, o enquadramento e a
# escala. O estilo quem da e o Qwen.
import bpy, math, sys, os

saida = sys.argv[sys.argv.index("--") + 1]

bpy.ops.wm.read_factory_settings(use_empty=True)
cena = bpy.context.scene

# Mundo cinza claro: sem ele o blockout fecha em breu e o VAEEncode herda isso.
mundo = bpy.data.worlds.new("mundo"); mundo.use_nodes = True
mundo.node_tree.nodes["Background"].inputs["Color"].default_value = (0.58, 0.62, 0.70, 1)
mundo.node_tree.nodes["Background"].inputs["Strength"].default_value = 1.1
cena.world = mundo

# --- materiais: so valores de cinza diferentes, para o modelo ler os planos ---
def mat(nome, cor, rugosidade=0.8):
    m = bpy.data.materials.new(nome)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*cor, 1)
    bsdf.inputs["Roughness"].default_value = rugosidade
    return m

M_PAREDE = mat("parede", (0.72, 0.70, 0.66))
M_PISO   = mat("piso",   (0.42, 0.36, 0.30))
M_TETO   = mat("teto",   (0.86, 0.86, 0.86))
M_LOUSA  = mat("lousa",  (0.10, 0.16, 0.13), 0.5)
M_MOVEL  = mat("movel",  (0.62, 0.45, 0.28))
M_METAL  = mat("metal",  (0.30, 0.30, 0.32), 0.4)
M_PROXY  = mat("proxy",  (0.55, 0.55, 0.58))

def caixa(nome, dim, loc, material):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object
    o.name = nome
    o.scale = dim
    o.data.materials.append(material)
    return o

# --- a sala: 8 m (x) x 10 m (y) x 3,2 m (z) ---
caixa("piso", (8, 10, 0.1), (0, 0, -0.05), M_PISO)
caixa("teto", (8, 10, 0.1), (0, 0, 3.25), M_TETO)
caixa("parede_lousa",    (8, 0.12, 3.2), (0,  5, 1.6), M_PAREDE)
caixa("parede_fundo",    (8, 0.12, 3.2), (0, -5, 1.6), M_PAREDE)
caixa("parede_esquerda", (0.12, 10, 3.2), (-4, 0, 1.6), M_PAREDE)

# Parede direita com faixa de janela (0,95 m a 2,30 m): luz lateral e
# profundidade de graca. Peitoril, viga e 3 pilares entre os vaos.
caixa("peitoril", (0.12, 10, 0.95), (4, 0, 0.475), M_PAREDE)
caixa("viga",     (0.12, 10, 0.95), (4, 0, 2.775), M_PAREDE)
for i, y in enumerate((-3.3, -0.1, 3.1)):
    caixa(f"pilar_{i}", (0.12, 0.25, 1.35), (4, y, 1.625), M_PAREDE)

# --- lousa e mesa do professor ---
caixa("lousa", (4.6, 0.06, 1.25), (-0.2, 4.9, 1.75), M_LOUSA)
caixa("mesa_prof", (1.8, 0.75, 0.06), (1.1, 3.5, 0.74), M_MOVEL)
for dx, dy in ((-0.8, -0.32), (0.8, -0.32), (-0.8, 0.32), (0.8, 0.32)):
    caixa("pe_prof", (0.07, 0.07, 0.72), (1.1 + dx, 3.5 + dy, 0.36), M_METAL)

# --- carteiras: 4 colunas x 3 fileiras, voltadas para a lousa ---
def carteira(n, x, y):
    caixa(f"tampo_{n}",  (0.62, 0.45, 0.04), (x, y, 0.73), M_MOVEL)
    for dx in (-0.26, 0.26):
        for dy in (-0.18, 0.18):
            caixa(f"pe_{n}", (0.04, 0.04, 0.71), (x + dx, y + dy, 0.355), M_METAL)
    caixa(f"assento_{n}", (0.40, 0.38, 0.04), (x, y - 0.52, 0.45), M_MOVEL)
    caixa(f"encosto_{n}", (0.40, 0.04, 0.38), (x, y - 0.70, 0.66), M_MOVEL)
    for dx in (-0.16, 0.16):
        for dy in (-0.16, 0.16):
            caixa(f"pec_{n}", (0.03, 0.03, 0.43), (x + dx, y - 0.52 + dy, 0.215), M_METAL)

n = 0
for x in (-2.55, -0.85, 0.85, 2.55):
    for y in (2.3, 0.5, -1.3):
        carteira(n, x, y); n += 1

# --- proxy de personagem: SO marca posicao, altura e orientacao ---
# Nao e um personagem modelado de proposito: quem diz quem e sao as
# referencias de imagem do Qwen (Picture 1/2).
def proxy(nome, x, y, altura=1.66):
    tronco = altura * 0.52
    bpy.ops.mesh.primitive_cylinder_add(radius=0.17, depth=tronco, location=(x, y, 0.42 + tronco / 2))
    t = bpy.context.active_object; t.name = f"{nome}_tronco"; t.data.materials.append(M_PROXY)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.105, depth=0.84, location=(x, y, 0.42))
    p = bpy.context.active_object; p.name = f"{nome}_pernas"; p.data.materials.append(M_PROXY)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.115, location=(x, y, altura - 0.10))
    c = bpy.context.active_object; c.name = f"{nome}_cabeca"; c.data.materials.append(M_PROXY)

proxy("proxy_professora", -1.6, 3.9)

# --- luz: sol entrando pela janela da direita, mais um preenchimento fraco ---
bpy.ops.object.light_add(type="SUN", location=(9, -2, 5))
sol = bpy.context.active_object
sol.data.energy = 6.5
sol.data.angle = math.radians(3)
sol.rotation_euler = (math.radians(58), math.radians(-32), math.radians(20))

bpy.ops.object.light_add(type="AREA", location=(0, 0, 3.0))
preench = bpy.context.active_object
preench.data.energy = 420
preench.data.size = 7

# --- camera: do fundo da sala, na altura dos olhos, olhando para a lousa ---
bpy.ops.object.camera_add(location=(0.45, -4.35, 1.85), rotation=(math.radians(85.5), 0, 0))
cam = bpy.context.active_object
cam.name = "Camera"
cam.data.lens = 30
cena.camera = cam

# --- render: a MESMA resolucao do workflow (1344x768, 16:9) ---
cena.render.resolution_x = 1344
cena.render.resolution_y = 768
cena.render.resolution_percentage = 100
cena.render.image_settings.file_format = "PNG"
cena.render.filepath = os.path.join(saida, "sala_layout.png")

# Blender 5.2 e novo: nao chutar o nome da engine, ler os disponiveis.
disponiveis = [i.identifier for i in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
escolhida = next((e for e in disponiveis if "EEVEE" in e), None) or next((e for e in disponiveis if "WORKBENCH" in e), disponiveis[0])
cena.render.engine = escolhida
print(f"[creativa] engines={disponiveis} escolhida={escolhida}")
if "EEVEE" in escolhida:
    try:
        cena.eevee.taa_render_samples = 32
    except Exception as e:
        print(f"[creativa] taa_render_samples: {e}")

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(saida, "sala_de_aula.blend"))
bpy.ops.render.render(write_still=True)
print(f"[creativa] pronto: {cena.render.filepath}")
