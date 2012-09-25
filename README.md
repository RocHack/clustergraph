Rochester Cluster Navigator
===========================

The [University of Rochester curriculum](http://www.rochester.edu/aboutus/curricula.html) has clusters of courses. Many courses fall into more than one cluster. This tool presents the courses and clusters as nodes in a graph, and allows you to explore the graph to navigate the curriculum.

[![Screenshot of Political Science courses and clusters](http://rochack.github.com/clustergraph/screenshot.png)](http://rochack.github.com/clustergraph/#course:psc248)

Updating the curriculum data
----------------------------

The data about courses and clusters comes from the Registrar's [Cluster Search Engine](https://secure1.rochester.edu/registrar/CSE/index.php). 

The script `scrape.js` downloads from that site all the data that the Cluster Navigator needs. To update the data, run the script as follows:

    node scrape.js courses-clusters.json

