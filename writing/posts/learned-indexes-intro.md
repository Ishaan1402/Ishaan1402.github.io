
My team investigated two separate questions:
1) Can we reconfigure learned index structures, e.g. ALEX, to store dynamic sparse graph data structures?
2) If possible, are there any advantages learned indices exhibit for dynamic graph insertion or graph traversal operations over standard Compressed Sparse Row-based structures? If not, what can we learn? 


# Background
Learned indices are data structures that use machine learning models to predict the position of data using keys as input. The fundamental idea is that an index is a function from keys to positions, and if you can learn that function, you can replace tree traversal with a model prediction plus a small local correction. 

- Recursive Model Index was the first to show this principle worked but it only operated on static, read-only data. 
- ALEX made it practical for dynamic workloads by adding gapped arrays for cheap inserts and a cost model for self-tuning (fanout, splitting, merging nodes, etc).

There are other learned indices out there, an example being Piece-wise Linear models e.g. FITing-Tree. However none exhibited the level of throughput in dynamic write-read queries nor the sophisticated dynamic insertion logic that ALEX did at the time. 

ALEX has great advantages in lookups and insertions for KV workloads. The original ALEX paper has specific metrics: [ALEX: An Updatable Adaptive Learned Index](https://dl.acm.org/doi/epdf/10.1145/3318464.3389711). Our mentor had prior worked on optimizing graph storage in data structure, specifically [VCSR](https://webpages.charlotte.edu/ddai/data/dong-ccgrid-22.pdf), so naturally he wanted to see if this newly proposed data storage solution could improve upon it.  

In the original RMI paper: [The Case for Learned Index Structures](https://arxiv.org/pdf/1712.01208), Kraska posited that if a model can learn the sort order of values well enough, you can replace chasing a bunch of pointers down a tree with one simple inference call + a 'last mile' range query to correct any residual errors. 

Specifically, if a model can learn the empirical CDF (Cumulative Distribution Function) of all key values stored, then you can effectively use that as a functioning index. We would represent the querying within this index as:

$$\text{position} = \text{CDF}(\text{key}) \times N$$ 
During bulk loading, ALEX fits linear models that map keys to predicted positions within a node’s local key range. These models approximate the local data distribution and ALEX, using a cost model, adapts by splitting nodes more aggressively in regions where the distribution is irregular. 

During query time, the root node computes a(key) + b, the linear function already approximated after loading. It then passes the result down to the appropriate child node which then uses it's linear function, based on it's range of the CDF curve, to approximate location of the key. It continues on this path until reaching a leaf node, in the form of a gapped array, where finally the model will perform a local exponential search to quickly find the position of the key. 

Insertion uses the same logic to predict where to store the key. The model will try to fill the key in an appropriate gap. If there's no gap then it will shift elements in the array. If the array is too full, the index will trigger a split to divide the node in two. 

The result is that the ALEX paper reports up to 4.1× higher throughput than B+ trees across read-write workloads while never performing worse, and up to 2000× smaller index size on those workloads.


# Translation
Dynamic graphs are far different than key-value workloads. These structures are a collection of nodes, filled with data and edges to connect one another. In order to translate these structures into a workload we could test ALEX on, we created graph-supported versions of ALEX and STX B+ Tree. 

STX B+ Tree was a state-of-the-art tree model used for KV storage (now replaced by TLX). This was our baseline we wanted to compare against the CSR-style structures to see if there really was any advantage to the unique properties of learned indices. 

We forked both structures and implemented functions before loading where each graph edge being inputted were translated to a single KV entry. This allowed us to keep the core functionality of both data structures, minimizing code changes. We implemented these changes in C++. 

We encoded both source and destination vertices of an edge, *(u, v)*, to a single 64-bit integer as our key. We then stored a 64-bit timestamp and randomly generated 32-bit weight as the value to each key.

```
key   = (uint64_t(u) << 32) | uint64_t(v)
value = std::pair<uint64_t, uint32_t>
```

This encoding orders edges by the source vertex `u`. In sparse graphs, this creates large gaps in key space, which affects model accuracy and increases node splitting. I'll touch on the impact of this in the later sections. 

We examined very closely the differences in CDF approximation between the graph and KV workloads as well, shown in the following figures.

![Amazon — empirical CDF of edge keys](writing/artifacts/amazon_ecdf.png)

![Orkut — empirical CDF of edge keys](writing/artifacts/orkut_ecdf.png)

![Road — empirical CDF of edge keys](writing/artifacts/road_ecdf.png)

![MathOverflow — empirical CDF of edge keys](writing/artifacts/mathoverflow_ecdf.png)

# Experimentation
On the KV side, we benchmarked ALEX against STX (the traditional B+ tree baseline) across common learned-index workloads and parameter sweeps, including dataset-specific runs and repeated experiments.

On the graph side, we benchmarked ALEX_Graph and STX_Graph (our forked variations), and then compared those results against SOTA dynamic graph data structures like VCSR, PCSR, BAL, and CSR. 

For the dynamic graph aspect, we used an update-heavy loading plan: bulk loading an initial 10% of the graph, then dynamically insert the rest, stressing the update paths rather than letting the structure work off a complete, static build.

Note: Bulk loading refers to presorting a portion of data and inserting into a DB or tree based index in order to build up the tree in a 'bottom-up' sort of way to form the basic structure of the tree, speeding up performance for subsequent singular updates

For graph algorithms, we implemented the following kernels:
- PageRank (fixed iterations)
- Single Source Shortest Path
- Breadth First Search
- 1-Hop query. 
As well as implementing multithreaded reading by adding OpenMP directives to analyze concurrent performance on these graph analysis algorithms. 

When running BFS and 1-Hop tests we ran into bugs,  segmentation faults for multithreaded ALEX queries.

For datasets, our graph results spreadsheet tracks runs across graphs including Amazon and Orkut, Live-Journal, Cit-Patents, Road, as-Skitter, StackOverflow, Enron, MathOverflow, fb-wall.

For KV microbenchmarks, we used datasets such as Longitudes, Longlat and varied thread counts up to 32 to study scaling behavior under point lookups and range-like access patterns (e.g., tuning MAX_LOOKUP_RANGE).

We also noticed a detail that ended up speeding up execution: many of our graph algorithm runs were done with lookup-stat updates disabled because we found the stat counters were in heavily used functions and had measurable overhead.


# What We Found
Many learned index writeups focus on whether they're faster than a B+ tree, but graph workloads force a second question: “is it competitive with graph-specific representations?”  We found this to be a much harsher comparison to evaluate for.

### ALEX vs the B+ tree
On graph insert time, ALEX beat the STX B+ tree baseline on the datasets we highlighted most often, which matched our expectation that using models to place data, + gapped leaf nodes can reduce expensive leaf shifts compared to denser B+ tree layouts.

For example, on the Amazon graph, our recorded average insert time was about 1.2413s for ALEX versus 1.9112s for STX in the same experiment table.

On the Orkut graph, the gap was larger: about 73.41s for ALEX versus 205.07s for STX in the same insert-time comparison table.

On KV point lookups, our multithreaded Longitudes benchmark shows ALEX starting strong at 1 thread with 10,930,000 lookups/sec and reaching 52,090,000 lookups/sec at 32 threads.

STX, interestingly, starts much lower at 1 thread (1,544,163 lookups/sec) but catches up by 32 threads (48,543,689 lookups/sec), which revealed a trend we saw repeatedly: STX benefits more from multithreading than ALEX, exhibiting diminishing returns for ALEX’s advantage at high thread counts.

ALEX's advantage in lookup performance faces diminishing returns when parallelizing compared to STX B+ Tree. STX benefits far more from multithreading, likely because it has a simpler node structure with fewer shared state contention points.
- We did not measure the contention points between the two, but the scaling behavior is consistent with this assumption. 

|Graph|ALEX|STX (B+ Tree)|VCSR|PCSR|BAL|ALEX vs STX|
|---|---|---|---|---|---|---|
|Amazon|1.24|1.91|0.55|1.47|0.75|**1.5× faster**|
|Orkut|73.4|205.1|42.2|125.8|40.9|**2.8× faster**|
|LiveJournal|27.3|60.4|13.7|39.1|18.7|**2.2× faster**|
|Cit-Patents|7.9|20.1|5.8|12.8|9.2|**2.5× faster**|
|Road|1.49|2.20|0.93|2.18|2.96|**1.5× faster**|
|StackOverflow|20.2|28.3|19.6|41.7|8.5|**1.4× faster**|

Table 1: Graph edge insertion time (s)

|Metric|Value|
|---|---|
|ALEX advantage at 1 thread|**up to 10.53× faster** than STX|
|ALEX advantage at 32 threads|**only 1.07× faster** than STX|
|STX threading speedup (1→32)|up to 10.17× greater than ALEX's|

Table 2: ALEX vs STX KV Lookup performance when scaling up threading

### ALEX vs graph-specific structures
When we zoom out to full graph algorithms, our own conclusion was very clear. We can format existing RMIs to fit graph workloads, but they are not yet as efficient as graph representations like CSR and VCSR.

This was made clear in our results: on Amazon PageRank, our table row shows ALEX at about 3.5079s while VCSR is listed at about 0.3720s (with other baselines also under ALEX for that row).

On SSSP for Amazon, the table row shows ALEX at about 0.1529s while VCSR is about 0.0894s, again indicating that specialized graph structures are far ahead for algorithmic performance.

Our results made sense in hindsight: our graph algorithms repeatedly chase edges across memory in irregular patterns. Learned indices only pay off when lookups are the main operation and if the access patterns are regular.

Sparse graphs (MathOverflow and Road) have become the outlying examples. Given a small number of edges compared to the number of vertices, the generated keys would be scattered across the entire space with considerable gaps between them.

ALEX handles this problem by subdividing nodes several times to keep models locally accurate, resulting in deeper trees and more cache lines hit per access.

The same issue becomes less significant in dense graphs (Amazon and Orkut).

| Graph        | ALEX  | STX  | VCSR  | CSR  | ALEX vs VCSR     |
| ------------ | ----- | ---- | ----- | ---- | ---------------- |
| Amazon       | 3.51  | 1.28 | 0.37  | 0.27 | 9.4× slower      |
| Orkut        | 152.8 | 86.3 | 19.1  | 17.2 | 8.0× slower      |
| LiveJournal  | 60.6  | 31.5 | 7.2   | 6.5  | 8.4× slower      |
| Cit-Patents  | 26.0  | 7.8  | 4.7   | 4.3  | 5.5× slower      |
| MathOverflow | 11.2  | 0.55 | 0.012 | —    | **~930× slower** |

Table 3: PageRank execution time (s), 20 iterations, 1-thread

### Sparse graphs and threading 
Road and MathOverflow would show up as recurring problem datasets where performance worsened as we increased thread count in graph analysis. Neither set performed well under ALEX, but were okay for STX.

The most likely explanation we came to was sparsity. Both graphs have very few edges relative to their vertex count, which meant the bitwise concatenated keys are spread across a huge key space with large gaps between populated regions. ALEX's cost model responds to this by splitting nodes repeatedly to fit local linear models to small clusters of keys. This results in a much deeper, more unbalanced tree than you'd see for dense graphs like Orkut or Amazon. Greater tree depth leads to more cache lines touched per lookup. 

This furthered our growing expectations that RMI-style architectures are a suboptimal approach to handling sparse graphs. They perform poorly when the key distribution is highly irregular, since more node splits increase tree depth and degrades locality. Maybe re-implementing ALEX into a structure that could localize those densely connected spaces could improve the cost model's predictions on where to split child nodes. 

### Stat Counter overhead
One detail we found was that when implementing graph algorithms for structures that weren't designed for such data, it's important to track and minimize any overhead on  iterator and lookup code paths. Even the smallest of operations per lookup can significantly decrease performance. 

During experimentation, we use conditions, like #ifdef, to temporarily disable increments like stats_.num_lookups++ from heavily used functions in order to minimize that overhead during measurement.

After disabling those lookup stat updates, we saw a significant improvement in performance for each algorithm, with BFS and PageRank benefited the most. These updates don't impact normal KV performance but can stagnate graph performance which requires millions of iterations over edges each run. 

In hindsight, this makes sense, however it was a consideration we didn't take at the time of first experimentation. Constantly iterating on experiments, tracking performance, and reading code helped us figure out the appropriate implementation for graph analysis in a structure meant for key-value workloads. 

# What We Learned
Our main takeaway from the work is that learned indices weren’t yet as efficient as CSR/VCSR-style representations for the graph workloads we tested.

In the meantime we discovered many things in the process:
- We confirmed that ALEX's insertion advantages to the SOTA B+ Tree models still carried over to graph-encoded data, as ALEX_Graph achieves 1.5-2.8x faster insertion than STX_Graph
- ALEX fell short in iterative graph traversal, compared to CSR-based indices, due to structural reasons. CSR stores neighbors of vertices contiguously meaning theoretically there's only one sequential scan for each visit to a vertex while ALEX has to store these edges globally.
- The sparse graph behavior (uncovered by Road and MathOverflow runs) interestingly exhibited worse results when increasing thread count, opposite to our assumptions. 
	- Our best explanation, backed by evaluating with perf cache-miss profiling against less sparse datasets (e.g., Amazon), was that sparse key distributions force ALEX's cost model to repeatedly split nodes, forming deeper trees than necessary. When adding multithreading to the equation, threads evict each other's lines from the shared cache rather than converging on shared nodes. Essentially, the cache couldn't hold every threads' working set, each on separate branches, exacerbated by the unnecessary depth. Denser graphs on the other hand, with shallower tree structures, benefitted far greater from multithreading. 


# Where This Goes
One direction we can improve is by introducing better models to improve performance. ALEX uses ordinary least squares linear regression with a closed-form formula for leaf node models. Our team discussed other regression techniques (e.g., polynomial) and comparing best-fit lines to gradient-descent-based regression approaches in order to address the sparse key distribution performance decline.

Another direction is concurrency as we expressed thread-safety issues around shared counters and lookup paths that could be further improved (instead of simply applying OpenMP locks and atomic operations).

A third direction is robustness to sparse or outlier key spaces, encountered by the Road/MathOverflow datasets. We mentioned that ALEX can have poor performance on outlier keys, leading to unnecessary tree depth, so adding modeling strategies for sparse key spaces may be beneficial.

Finally, supporting persistent memory datasets is another direction we can go, along with secondary storage support and designing concurrency control tailored to ALEX’s layout.

These mentioned solutions are consistent with where the field has been moving. Learned indexes can be integrated into persistent, disk-based distributed systems like Google's Bigtable, with improved read latency and throughput using a learned CDF model to predict which data block a key lives in. Knowledge graph systems, like Wikidata, stores facts in triples: (subject, predicate, object), which is extremely similar to how we encoded edges into this learned index. Queries on these systems are typically point lookups and short range queries, which is where ALEX_Graph was competitive. 

While CSR-based structures remain the obvious answer for static graph analytics, they are extremely rigid when handling continuous updates. With the rise in demand of highly dynamic graph workloads and large knowledge graphs that prioritize patterned lookups over sequential traversal, specialized learned indices represent a viable architecture for the next generation of data storage built for rapid ingestion and point-query performance.
