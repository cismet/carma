/*
 * To change this license header, choose License Headers in Project Properties.
 * To change this template file, choose Tools | Templates
 * and open the template in the editor.
 */
package de.cismet.carma;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.File;
import java.util.ArrayList;
import java.util.List;
import org.apache.commons.lang3.exception.ExceptionUtils;

/**
 *
 * @author jruiz
 */
public class AppLauncher {
    
    private static final org.apache.log4j.Logger LOG = org.apache.log4j.Logger.getLogger(CarmaLauncher.class);
    private final static ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    private final String carmaJsonArg;
    
    public AppLauncher(final String carmaUrlArg) {
        this.carmaJsonArg = carmaUrlArg;
    }
    
    public void launch() throws Exception {
        final File workingDir = new File(Environment.CARMA_HOME.getValue());
        final File carmaJson = new File(workingDir, carmaJsonArg);
        final CarmaDescription carmaDescription = OBJECT_MAPPER.readValue(carmaJson, CarmaDescription.class);        
        
        final List<String> jars = new ArrayList<>();
        for (final String jar : carmaDescription.getExecJars()) {
            final File jarFile = new File(workingDir, jar);
            jars.add(jarFile.getCanonicalPath());
        }
        
        // execute maven
        final MavenExcecutor mvnExectutor = new MavenExcecutor();
        mvnExectutor.setWorkingDir(new File(new File(workingDir, carmaDescription.getName()), carmaDescription.getBuildWorkingDir()));
        mvnExectutor.setJavaHome(new File(Environment.JAVA_HOME.getValue()));
        mvnExectutor.setMavenHome(new File(Environment.M2_HOME.getValue()));
        mvnExectutor.setClasspathJars(jars.toArray(new String[0]));
        mvnExectutor.setMvnArgs(carmaDescription.getBuildArgs());
        mvnExectutor.setExecArgs(carmaDescription.getExecArgs());
        mvnExectutor.execute();
    }
    
    public static void main(String[] args) {
        try {
            org.apache.log4j.PropertyConfigurator.configure(AppLauncher.class.getResource("log4j.properties")); // NOI18N
        } catch (final Exception ex) {
            System.err.println(ExceptionUtils.getStackTrace(ex));
        }
        
        try {                                    
            new AppLauncher(args[0]).launch();
        } catch (final Exception ex) {
            LOG.error("Error while launching with these args:\n" + String.join("\n", args), ex);
        }
    }    
    
}