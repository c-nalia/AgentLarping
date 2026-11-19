from PIL import Image, ImageDraw, ImageFilter
import math
S=1024
CORAL=(227,137,95); PURPLE=(195,160,255); GREEN=(104,217,164); BLUE=(124,183,255)
def rr(d,box,r,**k): d.rounded_rectangle(box,r,**k)
def spark(d,cx,cy,R,w,col):
    for i in range(6):
        a=math.pi/2+i*math.pi/3
        x,y=cx+R*math.cos(a),cy-R*math.sin(a)
        d.line([(cx,cy),(x,y)],fill=col,width=w)
        d.ellipse([x-w/2,y-w/2,x+w/2,y+w/2],fill=col)
    d.ellipse([cx-w*.7,cy-w*.7,cx+w*.7,cy+w*.7],fill=col)
def chevron(d,x,y,h,w,col):
    pts=[(x,y),(x+h*0.62,y+h/2),(x,y+h)]
    d.line(pts,fill=col,width=w,joint='curve')
    for p in (pts[0],pts[2]): d.ellipse([p[0]-w/2,p[1]-w/2,p[0]+w/2,p[1]+w/2],fill=col)
def base():
    im=Image.new('RGBA',(S,S),(0,0,0,0))
    # background tile with vertical gradient
    g=Image.new('RGBA',(S,S)); gd=ImageDraw.Draw(g)
    for y in range(S):
        t=y/S; c=tuple(int(a+(b-a)*t) for a,b in zip((34,30,28),(12,12,12)))
        gd.line([(0,y),(S,y)],fill=c+(255,))
    m=Image.new('L',(S,S),0); rr(ImageDraw.Draw(m),(24,24,S-24,S-24),210,fill=255)
    im.paste(g,(0,0),m)
    d=ImageDraw.Draw(im)
    rr(d,(24,24,S-24,S-24),210,outline=(60,56,52,255),width=8)
    return im,d
def big():
    im,d=base()
    # back window (another agent)
    rr(d,(300,170,880,610),46,fill=(24,22,30,255),outline=(95,80,130,255),width=10)
    d.rounded_rectangle((300,170,880,250),46,fill=(40,34,56,255)); d.rectangle((305,215,875,250),fill=(40,34,56,255))
    d.line([(300,250),(880,250)],fill=(95,80,130,255),width=8)
    # front window
    glow=Image.new('RGBA',(S,S),(0,0,0,0)); gd=ImageDraw.Draw(glow)
    rr(gd,(130,320,790,860),56,fill=(227,137,95,110)); glow=glow.filter(ImageFilter.GaussianBlur(40))
    im.alpha_composite(glow); d=ImageDraw.Draw(im)
    rr(d,(140,330,780,850),56,fill=(17,17,17,255),outline=(227,137,95,255),width=12)
    d.rounded_rectangle((146,336,774,430),50,fill=(32,30,29,255)); d.rectangle((146,390,774,430),fill=(32,30,29,255))
    d.line([(140,430),(780,430)],fill=(70,62,58,255),width=6)
    for i,c in enumerate((PURPLE,CORAL,GREEN)):
        cx=210+i*62; d.ellipse([cx-19,382-19,cx+19,382+19],fill=c)
    chevron(d,230,520,200,46,CORAL)
    spark(d,520,620,78,30,CORAL)
    d.rounded_rectangle((630,690,730,730),10,fill=(230,230,230,255))
    return im
def small():
    im,d=base()
    rr(d,(150,170,874,854),90,fill=(17,17,17,255),outline=(227,137,95,255),width=44)
    chevron(d,280,370,300,90,CORAL)
    d.rounded_rectangle((530,600,760,670),18,fill=(235,235,235,255))
    return im
B=big(); Sm=small()
B.save('/home/claude/alarping/assets/icon.png')
B.resize((64,64),Image.LANCZOS).save('/home/claude/alarping/app/logo.png')
frames=[]
for sz in (16,24,32,48,64,128,256):
    src=Sm if sz<=32 else B
    frames.append(src.resize((sz,sz),Image.LANCZOS))
frames[-1].save('/home/claude/alarping/assets/icon.ico',format='ICO',sizes=[(f.width,f.height) for f in frames],append_images=frames[:-1])
# preview sheet
sheet=Image.new('RGBA',(700,300),(32,32,32,255))
x=10
for sz in (256,128,64,48,32,24,16):
    f=(Sm if sz<=32 else B).resize((sz,sz),Image.LANCZOS); sheet.alpha_composite(f,(x,20)); x+=sz+12
sheet.save('/home/claude/tools/icon_preview.png')
print('ok')
