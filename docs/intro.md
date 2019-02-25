# Cut and Project Tiling

This applet draws plane tilings by *cutting* through a 3-or-more-dimensional square lattice with a 2-dimensional plane and *projecting* that slice of the lattice onto the cutting plane. This method, also called the projection method, was discovered by [de Bruijn](https://en.wikipedia.org/wiki/Nicolaas_Govert_de_Bruijn) in his investigation of the [Penrose tiling](https://en.wikipedia.org/wiki/Penrose_tiling) discovered by [Roger Penrose](https://en.wikipedia.org/wiki/Roger_Penrose).

De Bruijn observed that the Penrose tiling appears as the projection of a 5D square lattice when the cutting plane has a particular orientation and offset to the lattice. He also showed how this is equivalent to a method that uses 5 sets of parallel lines, which he called a *pentagrid*.

This tiling generator produces the tiling for any cutting plane orientation and offset, using either cut-and-project or a *multigrid* (generalized pentagrid).

- [Quick description of the controls](#controls)
- [Brief explanation of how it works](#how-it-works)
- [Links to more information](#references)

## Controls

Click and drag the tiling to pan around. Mouse-wheel to zoom.

**Axis Controls:** change the orientation of the cutting plane. Click and drag the control points. Each control point corresponds to one axis of the lattice. You can also choose the number of dimensions (number of axes) of the lattice.

**Offsets:** change the position of the cutting plane relative to the lattice. Specifically, this is the offset of the center of the tiling view relative to a nearby lattice point. Note that when you move the view by dragging, this will also change the offset!

**Colors:** pick colors for the tiling faces. All faces of the same type get the same color, and there is one type for each face orientation in the lattice. A face orientation is determined by two axes, so for an n-dimensional lattice, there are n choose 2 = n(n-1)/2 face types.

## How It Works

I have implemented both the cut-and-project and multigrid methods, and you can switch between them to see that they (almost) always produce exactly the same tiling.

(They might not be the same when there is some point where three or more multigrid lines intersect, what de Bruijn called a "singular" multigrid. A singular multigrid is ambiguous and could produce more than one valid tiling, or an invalid tiling depending on the vagaries of floating point precision. I have a consistent way of handling this for the multigrid method, but not completely for the cut-and-project method.)

#### Cut and project

Points, edges, and faces in the tiling are points, edges, and faces of the lattice that are in the neighborhood of the cutting plane. What is this "neighborhood"? Imagine a unit hypercube (axis-aligned with the lattice) centered on a lattice point. If the cutting plane passes through that hypercube, then the point is in the neighborhood of the cutting plane ("in the cut"). If both ends of an edge are in the cut then the edge is in the cut, and similarly if all four corners of a face are in the cut then the face is in the cut.

I start with lattice points near the offset position and perform a depth-first traversal of the lattice to find all points that are in the cut and in the view area. Then for each of these points, I check its neighbors to determine if enough are in the cut to form a face.

Cut testing: a lattice point is in the cut if the cutting plane passes through the axis-aligned unit hypercube centered on the point. We can also flip this around by centering the hypercube on the plane and saying: if there exists an axis-aligned hypercube whose center lies on the cutting plane that contains a lattice point, then that point is in the cut.

Visualize sliding a hypercube around on the cutting plane. As it slides around, it will cover some of the lattice points. If there is any place we can slide the hypercube to cover a given lattice point, then that point is in the cut.

Another way to visualize this is to to project the hypercube and lattice points onto the space *dual* to the cutting plane, which is the (n-2)-dimensional space orthogonal to it. If the projection of a lattice point onto the dual space falls within the projection of the unit hypercube onto the dual space, then there is somewhere we could slide the hypercube to cover that lattice point, and hence it is in the cut.

So we need to test if a point falls inside the projection, or *shadow*, of a hypercube in the dual space. The hypercube shadow forms a region bounded by pairs of parallel hyperplanes in the dual space. A point must be between every pair of bounding hyperplanes to be inside the shadow.

Now we have reduced the problem to testing whether a point falls between a pair of parallel hyperplanes. Represent each hyperplane pair by the unique vector (in the dual space) orthogonal to them, which I will refer to as a *check axis*. Projecting each vertex of the hypercube onto a check axis will determine a minimum and maximum bound for that check axis. To test a lattice point, project it onto each check axis and test whether it falls between the minimum and maximum for that check axis.

For a 2D cutting plane in an n-D space, the dual space will have dimension n-2, which means the hyperplanes will have dimension n-3. Each (n-3)-D hyperplane corresponds to an (n-3)-D surface of the hypercube. There are n choose (n-3) orientations of (n-3)-D surface in the hypercube, so we must find and test n choose (n-3) = n choose 3 check axes.

| Lattice dimension | # of check axes |
|:-----------------:|:---------------:|
| 3                 | 1               |
| 4                 | 4               |
| 5                 | 10              |
| 6                 | 20              |
| 7                 | 35              |

*TODO diagrams*

#### Multigrid

The multigrid method directly produces the faces of the tiling without even needing to consider faces (or points or edges) that might be outside it. As a result, it is much faster than cut-and-project.

For our purposes, an n-dimensional multigrid consists of n sets of parallel, evenly spaced lines. Every intersection of two grid lines corresponds to a face in the tiling. So to generate the tiling, we can iterate over each pair of grid lines that can intersect, find the intersection point, and then add that face to the tiling.

Sometimes, three (or more) grid lines intersect in the same point. De Bruijn calls a pentagrid *singular* when this happens; a pentagrid in which at most two grid lines intersect at any point is called *regular*. Usually singular grids are simply avoided, but with some care we can still generate a consistent tiling. *TODO explain*

## References

- Nice overview in a pair of articles from the American Mathematical Society about Penrose tilings. Explains different methods of creating them such as inflation-deflation, de Bruijn's pentagrid method, and the projection method.
    - [Penrose Tiles Talk Across Miles](http://www.ams.org/publicoutreach/feature-column/fcarc-penrose)
    - [Penrose Tilings Tied up in Ribbons](http://www.ams.org/publicoutreach/feature-column/fcarc-ribbons)

- [Quasitiler](http://www.geom.uiuc.edu/apps/quasitiler/about.html) by Eugenio Durand

- [deBruijn](http://www.gregegan.net/APPLETS/12/12.html) applet by Greg Egan. Accompanying [explanation](http://www.gregegan.net/APPLETS/12/deBruijnNotes.html) helped me understand the correspondence between the cut-and-project and multigrid methods.

- Wikipedia
    - [Penrose tiling](https://en.wikipedia.org/wiki/Penrose_tiling)
    - [Aperiodic tiling](https://en.wikipedia.org/wiki/Aperiodic_tiling)
    - [Quasicrystal](https://en.wikipedia.org/wiki/Quasicrystal)
