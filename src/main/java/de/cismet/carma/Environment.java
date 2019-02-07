/*
 * To change this license header, choose License Headers in Project Properties.
 * To change this template file, choose Tools | Templates
 * and open the template in the editor.
 */
package de.cismet.carma;

/**
 *
 * @author jruiz
 */
public enum Environment {
    
    CARMA_HOME ("CARMA_HOME"),
    JAVA_HOME ("JAVA_HOME"),
    M2_HOME ("M2_HOME");    
    
    private final String name;

    private Environment(final String name) {
        this.name = name;
    }
    
    public String getValue() {
        return System.getenv(name);
    }

}