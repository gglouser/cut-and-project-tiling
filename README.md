# Cut-and-Project Tiling

This applet is an interactive demonstration of cut-and-project tiling.

![sample screenshot](images/screenshot.png)

Cut-and-project tilings are made by a 2-dimensional plane cutting through a higher dimensional square lattice. Lattice points in the neighborhood of the cutting plane are projected onto the plane and connected by edges to create the tiling. The well-known Penrose tiling is among the many tilings that can be generated this way.

[Try it on github.io.](#tbd)

## Controls

Click and drag the tiling to pan around. Mouse-wheel to zoom.

**Axis Controls:** change the orientation of the cutting plane. Click and drag the control points. Each control point corresponds to one axis of the lattice. You can also choose the number of dimensions (number of axes) of the lattice.

**Offsets:** change the position of the cutting plane relative to the lattice. Specifically, this is the offset of the center of the tiling view relative to a nearby lattice point. Note that when you move the view by dragging, this will also change the offset!

**Colors:** pick colors for the tiling faces. All faces of the same type get the same color, and there is one type for each face orientation in the lattice. A face orientation is determined by two axes, so for an n-dimensional lattice, there are n-choose-2 face types.

## Acknowledgments

The axis control rosette appeared in an old screenshot I once saw of a cut-and-project tiling generator that ran on NeXTSTEP. Never saw the code, but I borrowed the idea. (Before that, I was trying to control the orientation of the cutting plane with angles.)
