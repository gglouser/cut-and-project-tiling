# Cut and Project Tiling

This is an interactive cut-and-project tiling generator. The tilings it creates are the result of *cutting* a 2-dimensional plane through a higher-dimensional square lattice and *projecting* some of the lattice onto the cutting plane. This method, also sometimes called the projection method, was discovered by [Nicolaas Govert de Bruijn](https://en.wikipedia.org/wiki/Nicolaas_Govert_de_Bruijn) in his investigation of the [Penrose tiling](https://en.wikipedia.org/wiki/Penrose_tiling) discovered by [Roger Penrose](https://en.wikipedia.org/wiki/Roger_Penrose).

- [Quick description of the controls](#controls)
- [Brief explanation of how it works](#how-it-works)
- [Links to more information](#references)

## Controls

Click and drag the tiling to pan around. Mouse-wheel to zoom.

**Axis Controls:** change the orientation of the cutting plane. Click and drag the control points. Each control point corresponds to one axis of the lattice. You can also choose the number of dimensions (number of axes) of the lattice.

**Offsets:** change the position of the cutting plane relative to the lattice. Specifically, this is the offset of the center of the tiling view relative to a nearby lattice point. Note that when you move the view by dragging, this will also change the offset!

**Colors:** pick colors for the tiling faces. All faces of the same type get the same color, and there is one type for each face orientation in the lattice. A face orientation is determined by two axes, so for an n-dimensional lattice, there are n choose 2 = n(n-1)/2 face types.

## How It Works

In very, very brief: Points, edges, and faces in the tiling are points, edges, and faces of the lattice that are in the neighborhood of the cutting plane. What is this "neighborhood"? Imagine a unit hypercube (axis-aligned with the lattice) centered on a lattice point. If the cutting plane passes through that hypercube, then the point is in the neighborhood of the cutting plane. If both ends of an edge are in then the edge is in, and similarly if all four points of a face are in then the face is in. I start with lattice points near the origin and perform a depth-first traversal of the lattice to find all the desired points.

Longer explanation and diagrams TBD.

## References

Nice overview in a pair of articles from the American Mathematical Society about Penrose tiling. Explains different methods of creating them such as inflation-deflation, de Bruijn's pentagrid method, and the projection method.
- [Penrose Tiles Talk Across Miles](http://www.ams.org/publicoutreach/feature-column/fcarc-penrose)
- [Penrose Tilings Tied up in Ribbons](http://www.ams.org/publicoutreach/feature-column/fcarc-ribbons)

Wikipedia
- [Penrose tiling](https://en.wikipedia.org/wiki/Penrose_tiling)
- [Aperiodic tiling](https://en.wikipedia.org/wiki/Aperiodic_tiling)
- [Quasicrystal](https://en.wikipedia.org/wiki/Quasicrystal)
