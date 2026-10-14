# Sala do asset (janelas a esquerda, porta a direita) + manequins da
# Lia e da Ami perto da janela + duas cameras. Renderiza layout e depth de cada.
# Uso: blender --background --factory-startup --python cena_lia_ami.py -- <saida>
import bpy, math, sys, os
from mathutils import Vector

saida = sys.argv[sys.argv.index("--") + 1]
os.makedirs(saida, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
cena = bpy.context.scene

mundo = bpy.data.worlds.new("mundo"); mundo.use_nodes = True
mundo.node_tree.nodes["Background"].inputs["Color"].default_value = (0.62, 0.68, 0.78, 1)
mundo.node_tree.nodes["Background"].inputs["Strength"].default_value = 1.1
cena.world = mundo

def mat(nome, cor, rug=0.8):
    m = bpy.data.materials.new(nome); m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*cor, 1); b.inputs["Roughness"].default_value = rug
    return m

M_PAREDE = mat("parede", (0.70, 0.72, 0.76))
M_PISO   = mat("piso",   (0.50, 0.60, 0.58))
M_TETO   = mat("teto",   (0.86, 0.86, 0.88))
M_LOUSA  = mat("lousa",  (0.10, 0.20, 0.16), 0.5)
M_MOVEL  = mat("movel",  (0.66, 0.52, 0.36))
M_METAL  = mat("metal",  (0.40, 0.40, 0.42), 0.4)
M_PORTA  = mat("porta",  (0.45, 0.38, 0.32))
M_PELE   = mat("pele",   (0.80, 0.70, 0.62))
M_UNIF   = mat("uniforme", (0.85, 0.85, 0.88))
M_SAIA   = mat("saia",   (0.16, 0.18, 0.30))
M_LIA    = mat("cabelo_lia", (0.45, 0.10, 0.16))
M_AMI    = mat("cabelo_ami", (0.80, 0.66, 0.32))

def caixa(nome, dim, loc, material, pai=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object; o.name = nome; o.scale = dim; o.data.materials.append(material)
    return o

# --- sala 8 x 10 x 3,2 m; lousa em y=+5; janelas na parede ESQUERDA (x=-4) ---
caixa("piso", (8, 10, 0.1), (0, 0, -0.05), M_PISO)
caixa("teto", (8, 10, 0.1), (0, 0, 3.25), M_TETO)
caixa("parede_lousa", (8, 0.12, 3.2), (0, 5, 1.6), M_PAREDE)
caixa("parede_fundo", (8, 0.12, 3.2), (0, -5, 1.6), M_PAREDE)
caixa("parede_direita", (0.12, 10, 3.2), (4, 0, 1.6), M_PAREDE)
caixa("porta", (0.04, 1.6, 2.1), (3.93, 3.6, 1.05), M_PORTA)
caixa("peitoril", (0.12, 10, 0.95), (-4, 0, 0.475), M_PAREDE)
caixa("viga", (0.12, 10, 0.75), (-4, 0, 2.875), M_PAREDE)
for i, y in enumerate((-3.3, -0.1, 3.1)):
    caixa(f"pilar_{i}", (0.12, 0.25, 1.55), (-4, y, 1.725), M_PAREDE)

caixa("lousa", (4.0, 0.06, 1.25), (0.0, 4.9, 1.75), M_LOUSA)
caixa("mesa_prof", (1.2, 0.6, 0.9), (0.0, 3.9, 0.45), M_MOVEL)

def carteira(n, x, y):
    caixa(f"tampo_{n}", (0.62, 0.45, 0.04), (x, y, 0.73), M_MOVEL)
    for dx in (-0.26, 0.26):
        for dy in (-0.18, 0.18):
            caixa(f"pe_{n}", (0.04, 0.04, 0.71), (x + dx, y + dy, 0.355), M_METAL)
    caixa(f"assento_{n}", (0.40, 0.38, 0.04), (x, y - 0.52, 0.45), M_MOVEL)
    caixa(f"encosto_{n}", (0.40, 0.04, 0.38), (x, y - 0.70, 0.66), M_MOVEL)
    for dx in (-0.16, 0.16):
        for dy in (-0.16, 0.16):
            caixa(f"pec_{n}", (0.03, 0.03, 0.43), (x + dx, y - 0.52 + dy, 0.215), M_METAL)

n = 0
for x in (-2.3, -0.75, 0.75, 2.3):
    for y in (2.4, 0.7, -1.0, -2.7):
        carteira(n, x, y); n += 1

# --- manequim: silhueta e altura, sem rosto. Saia e volume de cabelo porque
# o depth carrega a silhueta, e as duas usam o uniforme de saia. ---
def cilindro(nome, r, z0, z1, x, y, material, r2=None):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=z1 - z0, location=(x, y, (z0 + z1) / 2))
    else:
        bpy.ops.mesh.primitive_cone_add(radius1=r2, radius2=r, depth=z1 - z0, location=(x, y, (z0 + z1) / 2))
    o = bpy.context.active_object; o.name = nome; o.data.materials.append(material)
    return o

def manequim(nome, altura, x, y, olha_para, cabelo):
    k = altura / 1.5
    partes = []
    cab_r = 0.105 * k                       # cabeca grande de anime (~1/6,5 da altura)
    z_cab = altura - cab_r
    z_ombro = altura - 2 * cab_r - 0.05 * k
    z_cint = altura * 0.58
    z_saia = altura * 0.40
    for s in (-1, 1):
        partes.append(cilindro(f"{nome}_perna", 0.055 * k, 0, z_saia + 0.05, s * 0.075 * k, 0, M_PELE))
        # v2: braco colado ao tronco (sobrepoe), com ombro redondo — braco solto virava "outra pessoa"
        partes.append(cilindro(f"{nome}_braco", 0.042 * k, z_cint - 0.10 * k, z_ombro - 0.02 * k, s * 0.150 * k, 0, M_UNIF))
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.055 * k, location=(s * 0.135 * k, 0, z_ombro - 0.035 * k))
        o = bpy.context.active_object; o.name = f"{nome}_ombro"; o.data.materials.append(M_UNIF); partes.append(o)
    partes.append(cilindro(f"{nome}_saia", 0.13 * k, z_saia, z_cint, 0, 0, M_SAIA, r2=0.24 * k))
    partes.append(cilindro(f"{nome}_tronco", 0.140 * k, z_cint, z_ombro, 0, 0, M_UNIF, r2=0.112 * k))
    partes.append(cilindro(f"{nome}_pescoco", 0.04 * k, z_ombro, z_cab - cab_r * 0.6, 0, 0, M_PELE))
    bpy.ops.mesh.primitive_uv_sphere_add(radius=cab_r, location=(0, 0, z_cab))
    c = bpy.context.active_object; c.name = f"{nome}_cabeca"; c.data.materials.append(M_PELE); partes.append(c)
    # cabelo curto: um volume um pouco maior, puxado para tras e para baixo
    bpy.ops.mesh.primitive_uv_sphere_add(radius=cab_r * 1.18, location=(0, -0.02 * k, z_cab + 0.005))
    h = bpy.context.active_object; h.name = f"{nome}_cabelo"; h.scale = (1.08, 1.0, 0.98)
    h.data.materials.append(cabelo); partes.append(h)
    bpy.ops.object.empty_add(location=(x, y, 0))
    raiz = bpy.context.active_object; raiz.name = nome
    for p in partes:
        p.parent = raiz
    # frente do manequim = -Y local; gira para olhar o ponto pedido
    d = Vector((olha_para[0] - x, olha_para[1] - y))
    raiz.rotation_euler = (0, 0, math.atan2(d.x, -d.y))
    return raiz

# Lia e Ami no corredor da janela, uma de frente para a outra, meio viradas para a sala
manequim("Lia", 1.52, -3.35, 1.25, (-2.6, 0.2), M_LIA)
manequim("Ami", 1.42, -2.95, 0.35, (-3.3, 1.4), M_AMI)

# --- luz: sol entrando pelas janelas da esquerda ---
bpy.ops.object.light_add(type="SUN", location=(-9, -2, 5))
sol = bpy.context.active_object; sol.data.energy = 6.0; sol.data.angle = math.radians(3)
sol.rotation_euler = (math.radians(55), math.radians(35), math.radians(-20))
bpy.ops.object.light_add(type="AREA", location=(0, 0, 3.0))
p = bpy.context.active_object; p.data.energy = 450; p.data.size = 7

# --- cameras ---
def camera(nome, loc, alvo, lente):
    bpy.ops.object.camera_add(location=loc)
    c = bpy.context.active_object; c.name = nome; c.data.lens = lente
    c.rotation_euler = (Vector(alvo) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    return c

cameras = [
    # geral: do fundo, como a placa do asset
    (camera("geral", (0.4, -4.5, 1.55), (-0.6, 3.0, 1.25), 24), 0.5, 11.0),
    # plano medio: do corredor da janela, as duas de frente
    (camera("medio", (-3.05, -2.4, 1.30), (-3.15, 0.85, 1.05), 35), 1.5, 7.0),
]

cena.render.resolution_x, cena.render.resolution_y, cena.render.resolution_percentage = 1344, 768, 100
disp = [i.identifier for i in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
cena.render.engine = next((e for e in disp if "EEVEE" in e), disp[0])
try: cena.eevee.taa_render_samples = 32
except Exception: pass
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(saida, "cena.blend"))

# passada 1: layout (o que a gente olha)
for cam, _, _ in cameras:
    cena.camera = cam
    cena.render.image_settings.file_format = "PNG"; cena.render.image_settings.color_mode = "RGB"
    cena.render.filepath = os.path.join(saida, f"{cam.name}_layout.png")
    bpy.ops.render.render(write_still=True)

# passada 2: depth (o que o ControlNet ve) — mist invertido, perto = claro
bpy.context.view_layer.use_pass_mist = True
grupo = bpy.data.node_groups.new("Depth", "CompositorNodeTree")
grupo.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
cena.use_nodes = True; cena.compositing_node_group = grupo
rl = grupo.nodes.new("CompositorNodeRLayers"); inv = grupo.nodes.new("CompositorNodeInvert"); out = grupo.nodes.new("NodeGroupOutput")
grupo.links.new(rl.outputs["Mist"], inv.inputs["Color"]); grupo.links.new(inv.outputs["Color"], out.inputs[0])
cena.view_settings.view_transform = "Raw"
cena.world.mist_settings.falloff = "LINEAR"
for cam, ini, prof in cameras:
    cena.camera = cam
    cena.world.mist_settings.start = ini; cena.world.mist_settings.depth = prof
    cena.render.image_settings.color_mode = "BW"
    cena.render.filepath = os.path.join(saida, f"{cam.name}_depth.png")
    bpy.ops.render.render(write_still=True)
print("[creativa] pronto")
