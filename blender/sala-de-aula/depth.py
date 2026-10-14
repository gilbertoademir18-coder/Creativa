# Gera o mapa de profundidade da sala, para alimentar o ControlNet depth.
#
# O ponto do blockout: o Blender SABE a profundidade (um estimador so chuta).
# Usa o passe Mist, que ja sai normalizado 0..1, e inverte — a convencao do
# ControlNet depth e perto=claro, longe=escuro.
#
# ATENCAO Blender 5.x: o compositor virou um node group separado
# (scene.compositing_node_group); `scene.node_tree` e o no `Composite` nao
# existem mais — a saida agora e um NodeGroupOutput.
import bpy, sys, os

blend, saida = sys.argv[sys.argv.index("--") + 1], sys.argv[sys.argv.index("--") + 2]
bpy.ops.wm.open_mainfile(filepath=blend)

cena = bpy.context.scene

# O passe precisa estar ligado ANTES de criar o no, senao ele nasce sem a saida Mist.
bpy.context.view_layer.use_pass_mist = True

# A faixa do mist cobre a sala: camera em y=-4,35 e parede da lousa em y=+5.
mist = cena.world.mist_settings
mist.start = 0.5
mist.depth = 11.0
mist.falloff = "LINEAR"

grupo = bpy.data.node_groups.new("DepthCreativa", "CompositorNodeTree")
grupo.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
cena.use_nodes = True
cena.compositing_node_group = grupo

camadas = grupo.nodes.new("CompositorNodeRLayers")
inverte = grupo.nodes.new("CompositorNodeInvert")
final = grupo.nodes.new("NodeGroupOutput")
inverte.location, final.location = (320, 0), (620, 0)

disponiveis = [s.name for s in camadas.outputs]
if "Mist" not in disponiveis:
    raise SystemExit(f"[creativa] sem saida Mist; disponiveis: {disponiveis}")

grupo.links.new(camadas.outputs["Mist"], inverte.inputs["Color"])
grupo.links.new(inverte.outputs["Color"], final.inputs[0])

# Sem view transform: o depth e um dado, nao uma foto. AgX falsearia os valores.
try:
    cena.view_settings.view_transform = "Raw"
except Exception as e:
    print(f"[creativa] view_transform: {e}")

cena.render.image_settings.file_format = "PNG"
cena.render.image_settings.color_mode = "BW"
cena.render.filepath = os.path.join(saida, "sala_depth.png")
bpy.ops.render.render(write_still=True)
print(f"[creativa] depth pronto: {cena.render.filepath}")
