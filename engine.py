"""
Hermes 3D Engine
================
Free-flight floating camera built on Pygame + OpenGL (fixed-function pipeline).
Run with: python3 engine.py
"""

import math
import pygame
from pygame.locals import DOUBLEBUF, OPENGL
from OpenGL.GL import *
from OpenGL.GLU import gluPerspective, gluSphere, gluNewQuadric

WIDTH, HEIGHT = 1280, 720
MOUSE_SENSITIVITY = 0.15
MOVE_SPEED = 14.0
SPRINT_MULT = 3.0

CUBES = [
    ((220, 50, 50), (10, 1, 10)), ((50, 50, 220), (-15, 1, 20)),
    ((50, 180, 50), (25, 1, -10)), ((220, 220, 50), (-20, 1, -15)),
    ((220, 130, 50), (5, 1, -25)), ((150, 50, 200), (-30, 1, 5)),
    ((50, 200, 200), (35, 1, 15)), ((220, 100, 150), (-10, 1, 30)),
    ((200, 200, 200), (20, 1, 30)), ((140, 90, 50), (-25, 1, -30)),
]
SPHERES = [
    ((255, 100, 100), (0, 2, 0)), ((100, 255, 100), (40, 2, 0)),
    ((100, 100, 255), (-40, 2, 0)), ((255, 255, 100), (0, 2, 40)),
    ((255, 100, 255), (0, 2, -40)),
]
PILLAR_X = (-35, 0, 35)
TREES = [(-50, -50), (50, -50), (-50, 50), (50, 50), (0, -60), (-60, 0)]


def draw_box(cx, cy, cz, sx, sy, sz, rgb, rot_x=0.0):
    r, g, b = (c / 255.0 for c in rgb)
    hx, hy, hz = sx / 2.0, sy / 2.0, sz / 2.0
    glPushMatrix()
    glTranslatef(cx, cy, cz)
    if rot_x:
        glRotatef(rot_x, 1, 0, 0)
    glColor3f(r, g, b)
    glBegin(GL_QUADS)
    # +Z / -Z
    glVertex3f(-hx, -hy, hz); glVertex3f(hx, -hy, hz); glVertex3f(hx, hy, hz); glVertex3f(-hx, hy, hz)
    glVertex3f(-hx, -hy, -hz); glVertex3f(-hx, hy, -hz); glVertex3f(hx, hy, -hz); glVertex3f(hx, -hy, -hz)
    # +X / -X
    glVertex3f(hx, -hy, -hz); glVertex3f(hx, hy, -hz); glVertex3f(hx, hy, hz); glVertex3f(hx, -hy, hz)
    glVertex3f(-hx, -hy, -hz); glVertex3f(-hx, -hy, hz); glVertex3f(-hx, hy, hz); glVertex3f(-hx, hy, -hz)
    # +Y / -Y
    glVertex3f(-hx, hy, -hz); glVertex3f(-hx, hy, hz); glVertex3f(hx, hy, hz); glVertex3f(hx, hy, -hz)
    glVertex3f(-hx, -hy, -hz); glVertex3f(hx, -hy, -hz); glVertex3f(hx, -hy, hz); glVertex3f(-hx, -hy, hz)
    glEnd()
    glPopMatrix()


def draw_sphere(quadric, cx, cy, cz, radius, rgb):
    r, g, b = (c / 255.0 for c in rgb)
    glPushMatrix()
    glTranslatef(cx, cy, cz)
    glColor3f(r, g, b)
    gluSphere(quadric, radius, 16, 16)
    glPopMatrix()


def draw_ground():
    glColor3f(80 / 255.0, 160 / 255.0, 60 / 255.0)
    glBegin(GL_QUADS)
    glVertex3f(-200, 0, -200)
    glVertex3f(-200, 0, 200)
    glVertex3f(200, 0, 200)
    glVertex3f(200, 0, -200)
    glEnd()


def draw_scene(quadric):
    draw_ground()
    for rgb, (x, y, z) in CUBES:
        draw_box(x, y, z, 2, 2, 2, rgb)
    for rgb, (x, y, z) in SPHERES:
        draw_sphere(quadric, x, y, z, 3, rgb)
    for x in PILLAR_X:
        draw_box(x, 10, -35, 3, 20, 3, (180, 180, 190))
    draw_box(15, 1.5, 0, 6, 0.5, 14, (160, 160, 170), rot_x=15)
    draw_box(0, 20, 0, 15, 0.6, 15, (200, 200, 220))
    for x, z in TREES:
        draw_box(x, 3, z, 1, 6, 1, (100, 70, 40))
        draw_sphere(quadric, x, 7.5, z, 5, (40, 140, 40))


def draw_hud(font, fps, pos):
    glMatrixMode(GL_PROJECTION)
    glPushMatrix()
    glLoadIdentity()
    glOrtho(0, WIDTH, HEIGHT, 0, -1, 1)
    glMatrixMode(GL_MODELVIEW)
    glPushMatrix()
    glLoadIdentity()
    glDisable(GL_DEPTH_TEST)

    lines = [
        f'FPS: {fps:.0f}',
        f'Pos: {pos[0]:6.1f}, {pos[1]:6.1f}, {pos[2]:6.1f}',
    ]
    y = 10
    for line in lines:
        surf = font.render(line, True, (255, 255, 255))
        data = pygame.image.tostring(surf, 'RGBA', True)
        glRasterPos2f(10, y + surf.get_height())
        glDrawPixels(surf.get_width(), surf.get_height(), GL_RGBA, GL_UNSIGNED_BYTE, data)
        y += surf.get_height() + 2

    glEnable(GL_DEPTH_TEST)
    glPopMatrix()
    glMatrixMode(GL_PROJECTION)
    glPopMatrix()
    glMatrixMode(GL_MODELVIEW)


def main():
    pygame.init()
    pygame.display.set_caption('Hermes 3D Engine')
    pygame.display.set_mode((WIDTH, HEIGHT), DOUBLEBUF | OPENGL)
    pygame.mouse.set_visible(False)
    pygame.event.set_grab(True)
    pygame.mouse.get_rel()

    glEnable(GL_DEPTH_TEST)
    glClearColor(0.53, 0.78, 1.0, 1.0)
    glMatrixMode(GL_PROJECTION)
    gluPerspective(90, WIDTH / HEIGHT, 0.1, 500.0)
    glMatrixMode(GL_MODELVIEW)

    quadric = gluNewQuadric()
    font = pygame.font.SysFont('consolas', 20)
    clock = pygame.time.Clock()

    pos = [0.0, 12.0, -35.0]
    yaw, pitch = 0.0, -10.0

    print('=' * 62)
    print('Hermes 3D Engine')
    print('=' * 62)
    print('  W A S D      Move')
    print('  Mouse        Look')
    print('  E / Q        Fly up / down')
    print('  Shift        Sprint')
    print('  Esc          Quit')
    print('=' * 62)

    running = True
    frame_count = 0
    while running:
        dt = clock.tick(60) / 1000.0
        fps = clock.get_fps()
        frame_count += 1

        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            elif event.type == pygame.KEYDOWN and event.key == pygame.K_ESCAPE:
                running = False

        dx, dy = pygame.mouse.get_rel()
        yaw += dx * MOUSE_SENSITIVITY
        pitch -= dy * MOUSE_SENSITIVITY
        pitch = max(-89.0, min(89.0, pitch))

        keys = pygame.key.get_pressed()
        ry = math.radians(yaw)
        forward = (math.sin(ry), 0.0, math.cos(ry))
        right = (math.cos(ry), 0.0, -math.sin(ry))

        mv = [0.0, 0.0, 0.0]
        if keys[pygame.K_w]:
            mv[0] += forward[0]; mv[2] += forward[2]
        if keys[pygame.K_s]:
            mv[0] -= forward[0]; mv[2] -= forward[2]
        if keys[pygame.K_d]:
            mv[0] += right[0]; mv[2] += right[2]
        if keys[pygame.K_a]:
            mv[0] -= right[0]; mv[2] -= right[2]
        if keys[pygame.K_e]:
            mv[1] += 1.0
        if keys[pygame.K_q]:
            mv[1] -= 1.0

        length = math.sqrt(mv[0] ** 2 + mv[1] ** 2 + mv[2] ** 2)
        if length > 0:
            speed = MOVE_SPEED * (SPRINT_MULT if keys[pygame.K_LSHIFT] else 1.0)
            step = speed * dt / length
            pos[0] += mv[0] * step
            pos[1] += mv[1] * step
            pos[2] += mv[2] * step

        glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT)
        glLoadIdentity()
        glRotatef(-pitch, 1, 0, 0)
        glRotatef(-yaw, 0, 1, 0)
        glTranslatef(-pos[0], -pos[1], -pos[2])

        draw_scene(quadric)
        draw_hud(font, fps, pos)

        pygame.display.flip()

    pygame.quit()


if __name__ == '__main__':
    main()
